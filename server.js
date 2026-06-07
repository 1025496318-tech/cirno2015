const http = require('http');
const WebSocket = require('ws');

// Railway 会自动注入 process.env.PORT，如果本地运行则默认 8080
const PORT = process.env.PORT || 8080;

// 1. 使用 Node.js 原生 http 模块创建服务，彻底移除对 'express' 的依赖
const server = http.createServer((req, res) => {
    // 专门用来应对 Railway 网关健康检查的根路径访问
    if (req.url === '/') {
        res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('🎮 纯原生联机中转服务器正在平稳运行中！');
    } else {
        res.writeHead(404);
        res.end();
    }
});

// 2. 将 WebSocket 服务绑定到这个原生 http 服务上
const wss = new WebSocket.Server({ server });
const rooms = {};

// 3. 强制维持心跳，每 10 秒戳一下客户端，防止 Railway 认为没有流量而静默强杀连接
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        ws.ping(); // 向客户端发送 Ping 包
    });
}, 10000);

wss.on('connection', function connection(ws, req) {
    ws.isAlive = true;
    // 收到客户端的 pong 响应，证明连接依然活跃
    ws.on('pong', () => { ws.isAlive = true; });

    console.log(`[系统] 新连接接入`);
    let myRoom = null;
    let myRole = null;

    ws.on('message', function incoming(message) {
        let msgStr = message.toString();
        // 过滤常见的无意义空数据，防止局内干扰
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
            
            // 稍作延迟（100毫秒）再发送同步状态，确保通道握手彻底稳定
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    const info = `SYNC:P1=${rooms[myRoom].P1 ? 'READY' : 'EMPTY'}:P2=${rooms[myRoom].P2 ? 'READY' : 'EMPTY'}`;
                    ws.send(info);
                }
            }, 100);
            return;
        }

        // 准备与数据转发逻辑
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

        // 核心转发：P1 的消息转给 P2，P2
