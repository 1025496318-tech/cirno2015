const WebSocket = require('ws');

// 自动获取 Railway 分配的端口，如果没有则默认 8080
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// 存储所有的房间信息。结构如：{ "房间号": { "P1": ws对象, "P2": ws对象 } }
const rooms = {};

wss.on('connection', function connection(ws) {
    let myRoom = null;  // 当前玩家所在的房间号
    let myRole = null;  // 当前玩家的身份 (P1 或 P2)

    console.log('有新玩家连接到了服务器');

    ws.on('message', function incoming(message) {
        // 将收到的二进制或 Buffer 数据转换成普通的字符串文本
        const msgStr = message.toString().trim();

        // 【逻辑1】处理加入房间请求。暗号格式设定为：JOIN:房间号:身份
        // 例如 Scratch 发送：JOIN:12345:P1
        if (msgStr.startsWith('JOIN:')) {
            const parts = msgStr.split(':');
            myRoom = parts[1];
            myRole = parts[2]; // 'P1' 或 'P2'

            // 如果这个房间还没创建，先初始化它
            if (!rooms[myRoom]) {
                rooms[myRoom] = { P1: null, P2: null };
            }

            // 把当前玩家的连接塞进对应的房间和对应的身份里
            rooms[myRoom][myRole] = ws;
            console.log(`玩家以 [${myRole}] 身份加入了房间 [${myRoom}]`);

            // 如果 P1 和 P2 都到齐了，给双方发一个暗号 "START"，告诉他们可以开始对战了
            if (rooms[myRoom]['P1'] && rooms[myRoom]['P2']) {
                rooms[myRoom]['P1'].send('SYSTEM:START');
                rooms[myRoom]['P2'].send('SYSTEM:START');
                console.log(`房间 [${myRoom}] 玩家到齐，游戏正式开始！`);
            }
            return;
        }

        // 【逻辑2】无脑数据中转
        // 如果玩家已经进了房间，他发来的任何其他游戏数据（坐标、技能等），服务器都直接转发给对方
        if (myRoom && rooms[myRoom]) {
            // 如果我是 P1，目标就是 P2；反之亦然
            const targetRole = myRole === 'P1' ? 'P2' : 'P1';
            const targetWs = rooms[myRoom][targetRole];

            // 如果对方连接正常，直接转手发过去
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(msgStr);
            }
        }
    });

    // 【逻辑3】处理玩家断开连接（比如关掉网页或网络卡死）
    ws.on('close', () => {
        console.log(`玩家 [${myRole || '未知'}] 离开了房间 [${myRoom || '未知'}]`);
        
        if (myRoom && rooms[myRoom]) {
            // 告诉房间里的另一个人，对方退游戏了
            const targetRole = myRole === 'P1' ? 'P2' : 'P1';
            const targetWs = rooms[myRoom][targetRole];
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send('SYSTEM:OPPONENT_LEFT');
            }

            // 清理内存中的房间数据
            delete rooms[myRoom][myRole];
            if (!rooms[myRoom].P1 && !rooms[myRoom].P2) {
                delete rooms[myRoom];
                console.log(`房间 [${myRoom}] 已空，自动销毁。`);
            }
        }
    });
});

console.log(`🎮 联机中转服务器已在端口 ${PORT} 成功启动！`);