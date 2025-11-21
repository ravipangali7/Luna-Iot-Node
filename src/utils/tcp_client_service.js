const net = require('net');

class TCPClientService {
    constructor() {
        this.host = '103.96.247.92';
        this.port = 4010;
        this.client = null;
        this.isConnected = false;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = Infinity; // Keep trying to reconnect
        this.reconnectDelay = 5000; // 5 seconds
        this.pendingData = []; // Queue for data when disconnected
        this.isConnecting = false;
    }

    // Initialize and establish connection
    connect() {
        if (this.isConnecting || (this.client && this.isConnected)) {
            return;
        }

        this.isConnecting = true;
        console.log(`[TCP Client] Connecting to ${this.host}:${this.port}...`);

        this.client = new net.Socket();

        this.client.on('connect', () => {
            console.log(`[TCP Client] Connected to ${this.host}:${this.port}`);
            this.isConnected = true;
            this.isConnecting = false;
            this.reconnectAttempts = 0;
            
            // Send any pending data
            this.flushPendingData();
        });

        this.client.on('error', (err) => {
            console.error(`[TCP Client] Connection error:`, err.message);
            this.isConnected = false;
            this.isConnecting = false;
        });

        this.client.on('close', () => {
            console.log(`[TCP Client] Connection closed`);
            this.isConnected = false;
            this.isConnecting = false;
            this.client = null;
            
            // Attempt to reconnect
            this.scheduleReconnect();
        });

        this.client.on('timeout', () => {
            console.log(`[TCP Client] Connection timeout`);
            this.client.destroy();
        });

        // Set connection timeout
        this.client.setTimeout(30000); // 30 seconds

        // Attempt to connect
        this.client.connect(this.port, this.host, () => {
            // Connection successful (handled by 'connect' event)
        });
    }

    // Schedule reconnection attempt
    scheduleReconnect() {
        if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            console.log(`[TCP Client] Max reconnect attempts reached`);
            return;
        }

        this.reconnectAttempts++;
        const delay = this.reconnectDelay;
        
        console.log(`[TCP Client] Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms...`);
        
        setTimeout(() => {
            if (!this.isConnected && !this.isConnecting) {
                this.connect();
            }
        }, delay);
    }

    // Send JSON data to the server
    sendData(jsonData) {
        try {
            // Ensure data is a string
            const dataString = typeof jsonData === 'string' ? jsonData : JSON.stringify(jsonData);
            
            // Add newline delimiter if not present (common for TCP JSON protocols)
            const message = dataString.endsWith('\n') ? dataString : dataString + '\n';

            if (this.isConnected && this.client && !this.client.destroyed) {
                this.client.write(message, (err) => {
                    if (err) {
                        console.error(`[TCP Client] Error sending data:`, err.message);
                        // Queue data for retry when reconnected
                        this.pendingData.push(message);
                    } else {
                        // Data sent successfully
                    }
                });
            } else {
                // Connection not available, queue data
                console.log(`[TCP Client] Connection not available, queuing data`);
                this.pendingData.push(message);
                
                // Try to connect if not already connecting
                if (!this.isConnecting && !this.isConnected) {
                    this.connect();
                }
            }
        } catch (error) {
            console.error(`[TCP Client] Error in sendData:`, error.message);
        }
    }

    // Flush pending data when connection is established
    flushPendingData() {
        if (this.pendingData.length > 0) {
            console.log(`[TCP Client] Flushing ${this.pendingData.length} pending messages`);
            const dataToSend = [...this.pendingData];
            this.pendingData = [];
            
            dataToSend.forEach((data) => {
                if (this.isConnected && this.client && !this.client.destroyed) {
                    this.client.write(data, (err) => {
                        if (err) {
                            console.error(`[TCP Client] Error flushing pending data:`, err.message);
                            // Re-queue if failed
                            this.pendingData.push(data);
                        }
                    });
                } else {
                    // Re-queue if connection lost
                    this.pendingData.push(data);
                }
            });
        }
    }

    // Close connection
    close() {
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
        this.isConnected = false;
        this.isConnecting = false;
        this.pendingData = [];
    }

    // Get connection status
    getStatus() {
        return {
            isConnected: this.isConnected,
            isConnecting: this.isConnecting,
            reconnectAttempts: this.reconnectAttempts,
            pendingDataCount: this.pendingData.length
        };
    }
}

// Create singleton instance
const tcpClientService = new TCPClientService();

// Auto-connect on module load
tcpClientService.connect();

// Graceful shutdown
process.on('SIGINT', () => {
    tcpClientService.close();
});

process.on('SIGTERM', () => {
    tcpClientService.close();
});

module.exports = tcpClientService;

