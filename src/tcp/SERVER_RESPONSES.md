# Server Response Packets to Devices

This document describes what packets/data the server sends to devices via TCP connection.

## 1. GT06 Protocol Acknowledgment (ACK) Packet

**Location:** `gt06_handler.js` line 34-40

**Format:** Generated automatically by `gt06x22` library
- Typical structure: `0x78 0x78 0x05 0x01 [length] [checksum] 0x0D 0x0A`
- Start marker: `0x78 0x78` (GT06 protocol identifier)
- Command ID: `0x05` (ACK acknowledgment)
- Sub-command: `0x01`
- Length: Variable (number of data bytes)
- Checksum: Calculated checksum
- End marker: `0x0D 0x0A` (carriage return + line feed)

**Purpose:** ACK packet that device expects after sending data packets

**When Sent:** Automatically when `gt06.expectsResponse === true` (device sends data expecting response)

**Hex Example:** `78780501[length][checksum]0d0a`

**For IMEI `352312094594994`:** Logged with full hex dump and byte breakdown

---

## 2. Relay ON Command

**Location:** `tcp_service.js` sendRelayCommand() method and getCommandBuffer()

**Packet Format:**
- ASCII: `RELAY,1#\n`
- Hex: `0x52 0x45 0x4C 0x41 0x59 0x2C 0x31 0x23 0x0A`
- Bytes: `52 45 4C 41 59 2C 31 23 0A`
- Length: 9 bytes

**Purpose:** Turn relay ON on the device

**When Sent:** When server receives relay ON command request for the device

**For IMEI `352312094594994`:** Logged with hex, ASCII, and byte array format

---

## 3. Relay OFF Command

**Location:** `tcp_service.js` sendRelayCommand() method and getCommandBuffer()

**Packet Format:**
- ASCII: `RELAY,0#\n`
- Hex: `0x52 0x45 0x4C 0x41 0x59 0x2C 0x30 0x23 0x0A`
- Bytes: `52 45 4C 41 59 2C 30 23 0A`
- Length: 9 bytes

**Purpose:** Turn relay OFF on the device

**When Sent:** When server receives relay OFF command request for the device

**For IMEI `352312094594994`:** Logged with hex, ASCII, and byte array format

---

## 4. RESET Command

**Location:** `tcp_service.js` getCommandBuffer() method

**Packet Format:**
- ASCII: `RESET#\n`
- Hex: `0x52 0x45 0x53 0x45 0x54 0x23 0x0A`
- Bytes: `52 45 53 45 54 23 0A`
- Length: 7 bytes

**Purpose:** Reset the device

**When Sent:** When server receives RESET command request

**Note:** Command format may need verification with actual GT06 device specification

---

## 5. SERVER POINT Command

**Location:** `tcp_service.js` getCommandBuffer() method

**Packet Format:**
- ASCII: `SERVER,IP:PORT#\n`
- Example: `SERVER,38.54.71.218:6666#\n`
- Hex: Variable (depends on IP and port)
- Purpose: Configure server IP address and port on device

**When Sent:** When server receives SERVER_POINT command with IP and port parameters

**Note:** Format may vary based on device firmware implementation

---

## Summary Table

| Command Type | Packet (ASCII) | Hex Format | Length | Purpose |
|--------------|----------------|------------|--------|---------|
| GT06 ACK | Auto-generated | `78780501...0d0a` | Variable | Acknowledge device data |
| Relay ON | `RELAY,1#\n` | `52 45 4C 41 59 2C 31 23 0A` | 9 bytes | Turn relay ON |
| Relay OFF | `RELAY,0#\n` | `52 45 4C 41 59 2C 30 23 0A` | 9 bytes | Turn relay OFF |
| RESET | `RESET#\n` | `52 45 53 45 54 23 0A` | 7 bytes | Reset device |
| SERVER_POINT | `SERVER,IP:PORT#\n` | Variable | Variable | Configure server |

---

## Logging for IMEI `352312094594994`

All server responses sent to this specific device are logged with:
- Full hex dump of packet
- ASCII representation
- Byte-by-byte breakdown
- Timestamp
- Packet length

**Filter logs:** Use `grep "352312094594994"` or `grep "IMEI:"` to see all operations for this device

