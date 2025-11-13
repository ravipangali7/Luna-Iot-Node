const gt06_handler = require('./gt06_handler')

class DataHandler {

    constructor() {
        this.data = null;
        this.protocols = [
            {
                name: 'gt06',
                start: ['7878', '7979'],
                end: ['0D0A'],
            },
        ]
    }

    handleData(data, socket) {
        this.data = data
        const hexData = data.toString('hex');
        
        // Get IMEI from socket if available
        const imei = socket.deviceImei || 'Unknown';
        
        // Pre-process relay response messages (0x15) - npm package doesn't support them
        let relayResponseMsg = null;
        if (data.length >= 4) {
            const header = data.slice(0, 2);
            if (header.equals(Buffer.from("7878", "hex")) && data.length >= 5) {
                const cmdType = data[3];
                if (cmdType === 0x15) {
                    console.log('Detected relay response message (0x15) - handling separately');
                    relayResponseMsg = gt06_handler.parseRelayResponseMessage(data, imei);
                }
            }
        }
        
        // Also check for 7979 messages (relay status messages)
        let relayStatusMsg = null;
        if (data.length >= 4) {
            const header = data.slice(0, 2);
            if (header.equals(Buffer.from("7979", "hex"))) {
                const type = data[4];
                if (type === 0x21 || type === 0x01 || type === 0x00) {
                    console.log('Detected relay status message (7979) - handling separately');
                    relayStatusMsg = gt06_handler.parseRelayStatusMessage(data, imei);
                }
            }
        }
        
        // If we have a relay response or status message, process it and skip npm parser
        if (relayResponseMsg || relayStatusMsg) {
            const msgToProcess = relayResponseMsg || relayStatusMsg;
            // Process relay message asynchronously (it updates database and sends Socket.IO)
            gt06_handler.processRelayMessage(msgToProcess, imei).catch(err => {
                console.error('Error processing relay message:', err);
            });
            return; // Skip npm parser for relay messages
        }
        
        // Continue with normal GT06 message processing
        const usedProtcol = this.identifyer(hexData)

        if (usedProtcol) {
            if (usedProtcol.protocol === 'gt06' || usedProtcol.protocol === null) {
                new gt06_handler.GT06Handler(usedProtcol.data, socket);
            }
        }

    }

    identifyer(data) {
        for (const protocol of this.protocols) {
            if (data.startsWith(protocol.start[0]) || data.startsWith(protocol.start[1])) {
                if (protocol.name === 'gt06') {
                    if (data.startsWith(protocol.start[1])) {
                        data = '7878' + data.slice(4);
                    }
                }
                // Convert hex string back to Buffer before returning
                return { 'protocol': protocol.name, 'data': Buffer.from(data, 'hex') };
            }
        }
        return null;
    }

    clearData() {
        this.data = null;
    }

}

module.exports = {
    DataHandler
}