const WebSocket = require('ws');
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// 存储所有房间数据的对象
const rooms = {};

wss.on('connection', function connection(ws) {
    console.log('有新玩家连接到了服务器');
    let myRoom = null;
    let myRole = null;

    ws.on('message', function incoming(message) {
        let msgStr = message.toString();

        // 1. 【极简加入房间】使用字符串分割，绝对不会崩溃
        if (msgStr.startsWith('JOIN:')) {
            const parts = msgStr.split(':'); // 格式: JOIN:111:P1
            myRoom = parts[1];
            myRole = (parts[2] || 'P1').toUpperCase(); // 如果没角色，默认为P1

            if (!rooms[myRoom]) {
                rooms[myRoom] = { P1: null, P2: null, ready: { P1: false, P2: false }, destroyTimeout: null };
            }
            if (rooms[myRoom].destroyTimeout) { 
                clearTimeout(rooms[myRoom].destroyTimeout); 
                rooms[myRoom].destroyTimeout = null; 
            }

            rooms[myRoom][myRole] = ws;
            rooms[myRoom].ready[myRole] = false;
            
            console.log(`玩家[${myRole}]加入房间[${myRoom}]`);
            
            // 同步房间状态
            const info = `SYNC:P1=${rooms[myRoom].P1 ? 'READY' : 'EMPTY'}:P2=${rooms[myRoom].P2 ? 'READY' : 'EMPTY'}`;
            if (rooms[myRoom].P1) rooms[myRoom].P1.send(info);
            if (rooms[myRoom].P2) rooms[myRoom].P2.send(info);
            return;
        }

        // 2. 【准备逻辑】收到 READY 暗号
        if (msgStr.trim() === 'READY') {
            if (myRoom && rooms[myRoom]) {
                rooms[myRole === 'P1' ? 'P1' : 'P2'] = ws; // 确保引用正确
                rooms[myRoom].ready[myRole] = true;
                console.log(`房间[${myRoom}] 玩家[${myRole}] 已准备`);

                // 双方都准备好，通知开战
                if (rooms[myRoom].ready.P1 && rooms[myRoom].ready.P2) {
                    rooms[myRoom].P1.send('SYSTEM:START');
                    rooms[myRoom].P2.send('SYSTEM:START');
                    console.log(`房间[${myRoom}] 双方准备就绪，游戏开始！`);
                }
            }
            return;
        }

        // 3. 【局内聊天与物理中转】
        if (msgStr.startsWith('CHAT:')) {
            if (myRoom && rooms[myRoom]) {
                const targetRole = myRole === 'P1' ? 'P2' : 'P1';
                const targetWs = rooms[myRoom][targetRole];
                if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                    targetWs.send(`MSG:${myRole}:${msgStr.substring(5)}`);
                }
            }
        } else if (myRoom && rooms[myRoom]) {
            const targetRole = myRole === 'P1' ? 'P2' : 'P1';
            const targetWs = rooms[myRoom][targetRole];
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(msgStr);
            }
        }
    });

    ws.on('close', () => {
        if (myRoom && rooms[myRoom]) {
            rooms[myRoom][myRole] = null;
            console.log(`玩家[${myRole}]离开房间[${myRoom}]`);
            
            // 如果房间没人了，启动 1 分钟销毁倒计时
            if (!rooms[myRoom].P1 && !rooms[myRoom].P2) {
                rooms[myRoom].destroyTimeout = setTimeout(() => {
                    if (rooms[myRoom] && !rooms[myRoom].P1 && !rooms[myRoom].P2) {
                        delete rooms[myRoom];
                        console.log(`房间[${myRoom}]已销毁`);
                    }
                }, 60000);
            }
        }
    });
});

console.log(`🎮 联机中转服务器已启动！`);
