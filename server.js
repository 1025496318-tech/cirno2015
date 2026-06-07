const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

const rooms = {};

wss.on('connection', function connection(ws, req) {
    const ip = req.socket.remoteAddress;
    console.log(`[系统] 新连接接入: ${ip}`);

    let myRoom = null;
    let myRole = null;

    ws.on('message', function incoming(message) {
        let msgStr = message.toString();
        
        // 监控所有收到的指令
        console.log(`[消息] 收到来自 [${myRole||'未登记'}] 的数据: ${msgStr}`);

        // 1. 加入房间
        if (msgStr.startsWith('JOIN:')) {
            const parts = msgStr.split(':');
            myRoom = parts[1];
            myRole = (parts[2] || 'P1').toUpperCase();

            if (!rooms[myRoom]) {
                rooms[myRoom] = { P1: null, P2: null, ready: { P1: false, P2: false }, destroyTimeout: null };
            }
            if (rooms[myRoom].destroyTimeout) { 
                clearTimeout(rooms[myRoom].destroyTimeout); 
                rooms[myRoom].destroyTimeout = null; 
            }

            rooms[myRoom][myRole] = ws;
            rooms[myRoom].ready[myRole] = false;
            
            console.log(`[房间${myRoom}] 玩家[${myRole}] 已登记`);
            
            const info = `SYNC:P1=${rooms[myRoom].P1 ? 'READY' : 'EMPTY'}:P2=${rooms[myRoom].P2 ? 'READY' : 'EMPTY'}`;
            if (rooms[myRoom].P1) rooms[myRoom].P1.send(info);
            if (rooms[myRoom].P2) rooms[myRoom].P2.send(info);
            return;
        }

        // 2. 准备逻辑
        if (msgStr.trim() === 'READY') {
            if (myRoom && rooms[myRoom]) {
                rooms[myRoom].ready[myRole] = true;
                console.log(`[房间${myRoom}] 状态更新: 玩家[${myRole}] 已准备`);

                if (rooms[myRoom].ready.P1 && rooms[myRoom].ready.P2) {
                    console.log(`[房间${myRoom}] 双方就绪，发送开始信号`);
                    rooms[myRoom].P1.send('SYSTEM:START');
                    rooms[myRoom].P2.send('SYSTEM:START');
                }
            }
            return;
        }

        // 3. 聊天转发
        if (msgStr.startsWith('CHAT:')) {
            if (myRoom && rooms[myRoom]) {
                const chatContent = msgStr.substring(5);
                console.log(`[房间${myRoom}] 聊天: [${myRole}]说: ${chatContent}`);
                const targetRole = myRole === 'P1' ? 'P2' : 'P1';
                const targetWs = rooms[myRoom][targetRole];
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(`MSG:${myRole}:${chatContent}`);
                }
            }
        } 
        // 4. 物理数据转发
        else if (myRoom && rooms[myRoom]) {
            const targetRole = myRole === 'P1' ? 'P2' : 'P1';
            const targetWs = rooms[myRoom][targetRole];
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(msgStr);
            }
        }
    });

    ws.on('close', () => {
        console.log(`[系统] 玩家[${myRole}]连接关闭`);
        if (myRoom && rooms[myRoom]) {
            rooms[myRoom][myRole] = null;
            if (!rooms[myRoom].P1 && !rooms[myRoom].P2) {
                console.log(`[房间${myRoom}] 所有人已离开，启动60秒倒计时销毁`);
                rooms[myRoom].destroyTimeout = setTimeout(() => {
                    if (rooms[myRoom] && !rooms[myRoom].P1 && !rooms[myRoom].P2) {
                        delete rooms[myRoom];
                        console.log(`[房间${myRoom}] 已自动销毁`);
                    }
                }, 60000);
            }
        }
    });

    ws.on('error', (err) => console.error(`[系统] 连接错误:`, err));
});

console.log(`🎮 联机服务器已启动！`);
