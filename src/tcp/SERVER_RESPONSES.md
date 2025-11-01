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

## 2. Relay ON Command (Connect/Restore Oil-Electricity)

**Location:** `tcp_service.js` sendRelayCommand() method and getCommandBuffer()

**Packet Format (GT06 Protocol Section 6.1):**
- **Full GT06 Protocol Packet Structure:**
  - Start Bit: `0x78 0x78` (2 bytes)
  - Packet Length: 1 byte (from Protocol Number to Stop Bit)
  - Protocol Number: `0x80` (1 byte, server command)
  - Information Content:
    - Command Length: 1 byte (Server Flag Bit 4 + Command Content length)
    - Server Flag Bit: `0x00 0x00 0x00 0x00` (4 bytes)
    - Command Content: `HFYD#` (ASCII, 5 bytes)
    - Language: `0x00 0x02` (2 bytes, English) or `0x00 0x01` (Chinese)
    - Information Serial Number: 2 bytes
  - Error Check: 2 bytes (XOR checksum)
  - Stop Bit: `0x0D 0x0A` (2 bytes)

**Command Content (ASCII):** `HFYD#`
- Hex: `0x48 0x46 0x59 0x44 0x23`
- Purpose: Connect/Restore vehicle oil-electric control circuit

**Total Packet Length:** ~18-20 bytes (depends on serial number)

**When Sent:** When server receives relay ON command request for the device

**Device Response:**
- Success: `HFYD=Success!`
- Failure: `HFYD=Fail!`

**For IMEI `352312094594994`:** Logged with full GT06 packet hex, ASCII, and byte array format

**Important:** 
- Command is wrapped in full GT06 protocol packet according to section 6.1
- Official GT06 protocol format (section 6.5 for command content, section 6.1 for packet structure)

---

## 3. Relay OFF Command (Cut Off Oil-Electricity)

**Location:** `tcp_service.js` sendRelayCommand() method and getCommandBuffer()

**Packet Format (GT06 Protocol Section 6.1):**
- **Full GT06 Protocol Packet Structure:**
  - Start Bit: `0x78 0x78` (2 bytes)
  - Packet Length: 1 byte (from Protocol Number to Stop Bit)
  - Protocol Number: `0x80` (1 byte, server command)
  - Information Content:
    - Command Length: 1 byte (Server Flag Bit 4 + Command Content length)
    - Server Flag Bit: `0x00 0x00 0x00 0x00` (4 bytes)
    - Command Content: `DYD#` (ASCII, 4 bytes)
    - Language: `0x00 0x02` (2 bytes, English) or `0x00 0x01` (Chinese)
    - Information Serial Number: 2 bytes
  - Error Check: 2 bytes (XOR checksum)
  - Stop Bit: `0x0D 0x0A` (2 bytes)

**Command Content (ASCII):** `DYD#`
- Hex: `0x44 0x59 0x44 0x23`
- Purpose: Cut off vehicle oil-electric control circuit

**Total Packet Length:** ~17-19 bytes (depends on serial number)

**When Sent:** When server receives relay OFF command request for the device

**Device Response:**
- Success: `DYD=Success!`
- Failure: `DYD=Unvalued Fix` or `DYD=Speed Limit, Speed XXkm/h`

**For IMEI `352312094594994`:** Logged with full GT06 packet hex, ASCII, and byte array format

**Important:**
- Command is wrapped in full GT06 protocol packet according to section 6.1
- GT06 device requires: GPS fix must be valid AND vehicle speed < 20 km/h
- Official GT06 protocol format (section 6.4 for command content, section 6.1 for packet structure)
- Oil/electricity cannot be disconnected when GPS tracking is off or speed > 20 km/h

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

| Command Type | Command Content (ASCII) | Full Packet Format | Length | Purpose |
|--------------|------------------------|---------------------|--------|---------|
| GT06 ACK | Auto-generated | `78780501...0d0a` | Variable | Acknowledge device data |
| Relay ON | `HFYD#` | GT06 packet: `7878[length]80...HFYD#...0d0a` | ~18-20 bytes | Connect/Restore oil-electricity |
| Relay OFF | `DYD#` | GT06 packet: `7878[length]80...DYD#...0d0a` | ~17-19 bytes | Cut off oil-electricity |
| RESET | `RESET#` | GT06 packet: `7878[length]80...RESET#...0d0a` | Variable | Reset device |
| SERVER_POINT | `SERVER,IP:PORT#` | GT06 packet: `7878[length]80...SERVER...0d0a` | Variable | Configure server |

**Note:** Relay commands (ON/OFF), RESET, and SERVER_POINT are now wrapped in full GT06 protocol packets according to section 6.1, with proper headers, checksums, and stop bits.

---

## Logging for IMEI `352312094594994`

All server responses sent to this specific device are logged with:
- Full hex dump of packet
- ASCII representation
- Byte-by-byte breakdown
- Timestamp
- Packet length

**Filter logs:** Use `grep "352312094594994"` or `grep "IMEI:"` to see all operations for this device

