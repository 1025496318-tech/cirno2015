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
                console.log
