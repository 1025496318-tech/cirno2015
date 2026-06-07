const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

wss.on('connection', function connection(ws) {
    let myRoom = null;
    let myRole = null;

    ws.on('message', function incoming(message) {
        let msgStr = typeof message === 'string' ? message : message.toString();

        // 1. 加入房间
        if (msgStr.includes('JOIN')) {
            const roomMatch = msgStr.match(/JOIN\D*(\d+)/i);
            const roleMatch = msgStr.match(/(P1|P2)/i);
            if (roomMatch && roleMatch) {
                myRoom = roomMatch[1];
                myRole = roleMatch[2].toUpperCase();

                if (!rooms[myRoom]) {
                    rooms[myRoom] = { P1: null, P2: null, ready: { P1: false, P2: false }, destroyTimeout: null };
                }
                if (rooms[myRoom].destroyTimeout) { clearTimeout(rooms[myRoom].destroyTimeout); rooms[myRoom].destroyTimeout = null; }

                rooms[myRoom][myRole] = ws;
                // 重置准备状态
                rooms[myRoom].ready[myRole] = false;
                
                const info = `SYNC:P1=${rooms[myRoom].P1 ? 'READY' : 'EMPTY'}:P2=${rooms[myRoom].P2 ? 'READY' : 'EMPTY'}`;
                if (rooms[myRoom].P1) rooms[myRoom].P1.send(info);
                if (rooms[myRoom].P2) rooms[myRoom].P2.send(info);
                return;
            }
        }

        // 2. 玩家点击准备 (暗号: READY)
        if (msgStr === 'READY') {
            if (myRoom && rooms[myRoom]) {
                rooms[myRoom].ready[myRole] = true;
                console.log(`房间[${myRoom}] 玩家[${myRole}] 已准备`);

                // 如果双方都准备了，发送 SYSTEM:START
                if (rooms[myRoom].ready.P1 && rooms[myRoom].ready.P2) {
                    rooms[myRoom].P1.send('SYSTEM:START');
                    rooms[myRoom].P2.send('SYSTEM:START');
                    console.log(`房间[${myRoom}] 双方准备就绪，游戏开始！`);
                }
            }
            return;
        }

        // 3. 聊天与物理中转
        if (msgStr.startsWith('CHAT:')) { /* ...同上逻辑... */ }
        else if (myRoom && rooms[myRoom]) {
            const targetRole = myRole === 'P1' ? 'P2' : 'P1';
            const targetWs = rooms[myRoom][targetRole];
            if (targetWs && targetWs.readyState === WebSocket.OPEN) targetWs.send(msgStr);
        }
    });

    // ... (close 逻辑保持不变)
});
