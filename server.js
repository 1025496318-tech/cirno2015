const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

// 1. 原生 http 服务响应健康检查
const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('🎮 纯原生联机中转服务器正在平稳运行中！');
    } else {
        res.writeHead(404);
        res.end();
    }
});

// 2. 绑定 WebSocket 服务
const wss = new WebSocket.Server({ server });
const rooms = {};

// 3. 心跳检测机制（每 10 秒戳一下客户端）
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
    });
}, 10000);

wss.on('connection', function connection(ws, req) {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    console.log(`[系统] 新连接接入`);
    let myRoom = null;
    let myRole = null;

    ws.on('message', function incoming(message) {
        let msgStr = message.toString();
        if (msgStr === 'NONE' || msgStr === '') return;

        console.log(`[消息] 收到数据: ${msgStr}`);

        // 加入房间逻辑
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
            
            console.log(`[房间${myRoom}] 玩家[${myRole}] 登记成功`);
            
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    const info = `SYNC:P1=${rooms[myRoom].P1 ? 'READY' : 'EMPTY'}:P2=${rooms[myRoom].P2 ? 'READY' : 'EMPTY'}`;
                    ws.send(info);
                }
            }, 100);
            return;
        }

        // 准备逻辑
        if (msgStr.trim() === 'READY') {
            if (myRoom && rooms[myRoom]) {
                rooms[myRoom].ready[myRole] = true;
                if (rooms[myRoom].ready.P1 && rooms[myRoom].ready.P2) {
                    if (rooms[myRoom].P1) rooms[myRoom].P1.send('SYSTEM:START');
                    if (rooms[myRoom].P2) rooms[myRoom].P2.send('SYSTEM:START');
                }
            }
            return;
        }

        // 数据转发逻辑
        if (myRoom && rooms[myRoom]) {
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
            if (!rooms[myRoom].P1 && !rooms[myRoom].P2) {
                rooms[myRoom].destroyTimeout = setTimeout(() => {
                    if (rooms[myRoom] && !rooms[myRoom].P1 && !rooms[myRoom].P2) {
                        delete rooms[myRoom];
                        console.log(`[房间${myRoom}] 已自动销毁`);
                    }
                }, 60000);
            }
        }
    });
});

wss.on('close', () => {
    clearInterval(interval);
});

// 4. 监听端口启动服务
server.listen(PORT, () => {
    console.log(`🎮 纯原生服务器已成功启动，正在监听端口: ${PORT}`);
});
