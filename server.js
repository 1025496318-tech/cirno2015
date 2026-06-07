const WebSocket = require('ws');

// 自动获取 Railway 分配的端口，如果没有则默认使用 8080
const PORT = process.env.PORT || 8080;
const wss = new WebSocket.Server({ port: PORT });

// 存储所有房间数据的对象
// 结构: { 房间号: { P1: ws, P2: ws, destroyTimeout: null } }
const rooms = {};

wss.on('connection', function connection(ws) {
    console.log('有新玩家连接到了服务器');

    let myRoom = null;
    let myRole = null;

    ws.on('message', function incoming(message) {
        let msgStr;
        try {
            // 强行把收到的任何数据（Buffer, ArrayBuffer等）转化为标准的UTF-8字符串
            if (Buffer.isBuffer(message)) {
                msgStr = message.toString('utf8').trim();
            } else if (typeof message === 'string') {
                msgStr = message.trim();
            } else {
                msgStr = message.toString().trim();
            }
        } catch (e) {
            console.log('解析数据失败:', e);
            return;
        }

        // 【逻辑1】处理加入房间请求 (认准英文冒号分隔符)
        if (msgStr.startsWith('JOIN:')) {
            const parts = msgStr.split(':');
            myRoom = parts[1];
            myRole = parts[2]; // 'P1' 或 'P2'

            // 如果房间不存在，初始化它
            if (!rooms[myRoom]) {
                rooms[myRoom] = { P1: null, P2: null, destroyTimeout: null };
            }

            // ⭐【核心改动】如果这个房间正在进行 1 分钟毁灭倒计时，立刻拦截并取消它！
            if (rooms[myRoom].destroyTimeout) {
                clearTimeout(rooms[myRoom].destroyTimeout);
                rooms[myRoom].destroyTimeout = null;
                console.log(`🔄 有玩家在1分钟内重新连接，房间 [${myRoom}] 销毁倒计时已紧急取消！`);
            }

            // 将当前连接记录到对应的角色里
            rooms[myRoom][myRole] = ws;
            console.log(`玩家以 [${myRole}] 身份加入了房间 [${myRoom}]`);

            // 如果 P1 和 P2 都到齐了，广播游戏开始暗号
            if (rooms[myRoom]['P1'] && rooms[myRoom]['P2']) {
                rooms[myRoom]['P1'].send('SYSTEM:START');
                rooms[myRoom]['P2'].send('SYSTEM:START');
                console.log(`房间 [${myRoom}] 玩家到齐，游戏正式开始！`);
            }
            return;
        }

        // 【逻辑2】无脑数据中转
        if (myRoom && rooms[myRoom]) {
            const targetRole = myRole === 'P1' ? 'P2' : 'P1';
            const targetWs = rooms[myRoom][targetRole];
            // 只有当对方在线且连接打开时，才进行转发
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(msgStr);
            }
        }
    });

    // 玩家断开连接时的处理
    ws.on('close', () => {
        console.log(`玩家 [${myRole || '未知'}] 离开了房间 [${myRoom || '未知'}]`);
        
        if (myRoom && rooms[myRoom]) {
            // 1. 将当前断开的玩家从房间位置中清除
            rooms[myRoom][myRole] = null;

            // 2. 检查房间里是不是已经彻底没人了（P1和P2都是null）
            if (!rooms[myRoom].P1 && !rooms[myRoom].P2) {
                console.log(`房间 [${myRoom}] 暂时没人了，启动 1 分钟销毁倒计时...`);
                
                // 如果之前已经有一个倒计时在跑了，先把它清除，防止冲突
                if (rooms[myRoom].destroyTimeout) {
                    clearTimeout(rooms[myRoom].destroyTimeout);
                }

                // 设置 60000 毫秒（1分钟）后执行销毁
                rooms[myRoom].destroyTimeout = setTimeout(() => {
                    // 1分钟时间到，再次双重确认房间在这期间有没有人加进来
                    if (rooms[myRoom] && !rooms[myRoom].P1 && !rooms[myRoom].P2) {
                        delete rooms[myRoom];
                        console.log(`⏱️ 1分钟内无人重新加入，房间 [${myRoom}] 已空，正式自动销毁。`);
                    }
                }, 60000); // 60000 毫秒 = 1 分钟
            }
        }
    });

    // 容错处理：防止因为单个连接报错导致整个服务器死机
    ws.on('error', (err) => {
        console.error('连接发生错误:', err);
    });
});

console.log(`🎮 联机中转服务器已在端口 ${PORT} 成功启动！`);
