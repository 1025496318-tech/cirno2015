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

    // 为每个连接分配一个临时的唯一标识，方便在日志中追踪
    const clientIp = req.socket.remoteAddress;
    const clientPort = req.socket.remotePort;
    const clientId = `${clientIp}:${clientPort}`;
    console.log(`[系统] 新连接接入 -> 来自: ${clientId}`);

    let myRoom = null;
    let myRole = null;

    ws.on('message', function incoming(message) {
        let msgStr = message.toString().trim();
        if (msgStr === 'NONE' || msgStr === '') return;

        console.log(`[数据接收] 收到来自 [${myRole || '未登记角色'}](${clientId}) 的原始数据: ${msgStr}`);

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
            
            console.log(`[房间系统] 房间:${myRoom} | 玩家:[${myRole}] 登记成功！(绑定到连接: ${clientId})`);
            
            setTimeout(() => {
                if (ws.readyState === WebSocket.OPEN) {
                    const info = `SYNC:P1=${rooms[myRoom].P1 ? 'READY' : 'EMPTY'}:P2=${rooms[myRoom].P2 ? 'READY' : 'EMPTY'}`;
                    ws.send(info);
                    console.log(`[系统发送] 已向 [${myRole}] 发送房间同步状态: ${info}`);
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
                    console.log(`[房间系统] 房间:${myRoom} | 双端均已就绪，正在下发游戏开始指令...`);
                    if (rooms[myRoom].P1) rooms[myRoom].P1.send('SYSTEM:START');
                    if (rooms[myRoom].P2) rooms[myRoom].P2.send('SYSTEM:START');
                }
            } else {
                console.log(`[警告] 收到 READY 指令，但该连接未加入任何房间！(来自: ${clientId})`);
            }
            return;
        }

        // ======= 逻辑 C：核心数据转发逻辑（升级增强版） =======
        if (myRoom && rooms[myRoom]) {
            const targetRole = myRole === 'P1' ? 'P2' : 'P1';
            const targetWs = rooms[myRoom][targetRole];
            
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                // 执行转发
                targetWs.send(msgStr);
                // 彻底排查时可取消下面这行的注释来观察转发细节
                // console.log(`[转发成功] 房间:${myRoom} | 已成功将 [${myRole}] 的数据投递给 [${targetRole}]`);
            } else {
                console.log(`[转发失败] 房间:${myRoom} | [${myRole}] 发送了数据，但对手 [${targetRole}] 当前 ${targetWs ? '连接已断开(NOT OPEN)' : '尚未加入房间(NULL)'}！`);
            }
        } else {
            console.log(`[拦截丢弃] 拦截到未注册连接(${clientId})发送的游戏数据: "${msgStr}"。原因：该玩家还未发送 JOIN 指令加入房间！`);
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

// 4. 监听端口启动服务
server.listen(PORT, () => {
    console.log(`🎮 ⚙️ 增强诊断版中转服务器已成功启动，正在监听端口: ${PORT}`);
});
