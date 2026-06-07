const express = require('express');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 8080;

// 提供网页根路径响应，专门用来应付 Railway 网关的健康检查
app.get('/', (req, res) => {
    res.send('🎮 联机服务器正在完美运行中！');
});

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const rooms = {};

// 强制维持心跳，每 10 秒戳一下客户端，防止 Railway 静默强杀连接
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
        if (msgStr === 'NONE' || msgStr === '') return; // 过滤空数据

        console.log(`[消息] 收到数据: ${msgStr}`);

        // 1. 加入房间逻辑
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
            
            // 延迟 100ms 发送同步，确保通道完全稳定
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    const info = `SYNC:P1=${rooms[myRoom].P1 ? 'READY' : 'EMPTY'}:P2=${rooms[myRoom].P2 ? 'READY' : 'EMPTY'}`;
                    ws.send(info);
                }
            }, 100);
            return;
        }

        // 2. 准备与转发逻辑
        if (msgStr.trim() === 'READY') {
            if (myRoom && rooms[myRoom]) {
                rooms[myRoom].ready[myRole] = true;
                if (rooms[myRoom].ready.P1 && rooms[myRoom].ready.P2) {
                    rooms[myRoom].P1.send('SYSTEM:START');
                    rooms[myRoom].P2.send('SYSTEM:START');
                }
            }
            return;
        }

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
                    }
                }, 60000);
            }
        }
    });
});

server.listen(PORT, () => {
    console.log(`服务器已在端口 ${PORT} 启动`);
});
