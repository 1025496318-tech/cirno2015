const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 8080;

const server = http.createServer((req, res) => {
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('🎮 纯原生联机中转服务器正在平稳运行中！');
    } else {
        res.writeHead(404);
        res.end();
    }
});

const wss = new WebSocket.Server({ server });
const rooms = {};

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

    const clientIp = req.socket.remoteAddress;
    const clientPort = req.socket.remotePort;
    const clientId = `${clientIp}:${clientPort}`;
    console.log(`[系统] 新连接接入 -> 来自: ${clientId}`);

    let myRoom = null;
    let myRole = null;
    
    // 🌟 核心优化：用来记录上一次打印的日志内容，防止刷屏
    ws.lastLogMsg = null;
    ws.lastFailMsg = null;

    ws.on('message', function incoming(message) {
        let msgStr = message.toString().trim();
        if (msgStr === 'NONE' || msgStr === '') return;

        // 🌟 优化 1：收到重复的按键数据时，默默转发，绝不刷屏打印日志
        if (ws.lastLogMsg !== msgStr) {
            console.log(`[数据接收] 收到来自 [${myRole || '未登记角色'}](${clientId}) 的内容: ${msgStr}`);
            ws.lastLogMsg = msgStr; // 记住这次的内容
        }

        // ======= 逻辑 A：加入房间逻辑 =======
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
            
            console.log(`[房间系统] 房间:${myRoom} | 玩家:[${myRole}] 登记成功！`);
            
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    const info = `SYNC:P1=${rooms[myRoom].P1 ? 'READY' : 'EMPTY'}:P2=${rooms[myRoom].P2 ? 'READY' : 'EMPTY'}`;
                    ws.send(info);
                }
            }, 100);
            return;
        }

        // ======= 逻辑 B：游戏准备逻辑 =======
        if (msgStr === 'READY') {
            if (myRoom && rooms[myRoom]) {
                rooms[myRoom].ready[myRole] = true;
                console.log(`[房间系统] 房间:${myRoom} | 玩家:[${myRole}] 已准备就绪`);
                
                if (rooms[myRoom].ready.P1 && rooms[myRoom].ready.P2) {
                    console.log(`[房间系统] 房间:${myRoom} | 双端均已就绪，下发游戏开始指令！`);
                    if (rooms[myRoom].P1) rooms[myRoom].P1.send('SYSTEM:START');
                    if (rooms[myRoom].P2) rooms[myRoom].P2.send('SYSTEM:START');
                }
            }
            return;
        }

        // ======= 逻辑 C：核心数据转发逻辑 =======
        if (myRoom && rooms[myRoom]) {
            const targetRole = myRole === 'P1' ? 'P2' : 'P1';
            const targetWs = rooms[myRoom][targetRole];
            
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                // 默默后台转发，不留日志痕迹
                targetWs.send(msgStr);
            } else {
                // 🌟 优化 2：即使转发失败，相同的失败报告也只打印一次，防止刷屏
                if (ws.lastFailMsg !== msgStr) {
                    console.log(`[转发失败] 房间:${myRoom} | 对手 [${targetRole}] 当前不在房间或已断开。`);
                    ws.lastFailMsg = msgStr;
                }
            }
        }
    });

    ws.on('close', () => {
        console.log(`[系统] 连接断开 <- ${clientId} [${myRole || '未登记角色'}]`);
        if (myRoom && rooms[myRoom]) {
            rooms[myRoom][myRole] = null;
            if (!rooms[myRoom].P1 && !rooms[myRoom].P2) {
                rooms[myRoom].destroyTimeout = setTimeout(() => {
                    if (rooms[myRoom] && !rooms[myRoom].P1 && !rooms[myRoom].P2) {
                        delete rooms[myRoom];
                        console.log(`[房间系统] 房间:${myRoom} 内已无玩家，已执行自动销毁。`);
                    }
                }, 60000);
            }
        }
    });
});

wss.on('close', () => {
    clearInterval(interval);
});

server.listen(PORT, () => {
    console.log(`🎮 中转服务器升级成功！已开启智能去重静音日志，正在监听: ${PORT}`);
});
