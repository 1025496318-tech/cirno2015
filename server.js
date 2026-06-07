ws.on('message', function incoming(message) {
        let msgStr;
        try {
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

        // 📝【超级兼容解析】无论你带不带括号、冒号、分号，只要包含 JOIN、数字、P1/P2，就把它们抠出来
        // 匹配格式如：JOIN:999:P1 或 JOIN999;P1 或 {"data":"JOIN:999:P1"}
        if (msgStr.includes('JOIN')) {
            console.log(`📡 收到原始加入数据: "${msgStr}"`); // 这行能让你看清扩展到底发了什么
            
            // 用正则提取出所有的数字（房间号）和 P1/P2（角色）
            const roomMatch = msgStr.match(/JOIN\D*(\d+)/i); // 提取JOIN后面的数字
            const roleMatch = msgStr.match(/(P1|P2)/i);      // 提取P1或P2

            if (roomMatch && roleMatch) {
                myRoom = roomMatch[1];
                myRole = roleMatch[2].toUpperCase(); // 统一变大写

                if (!rooms[myRoom]) {
                    rooms[myRoom] = { P1: null, P2: null, destroyTimeout: null };
                }

                if (rooms[myRoom].destroyTimeout) {
                    clearTimeout(rooms[myRoom].destroyTimeout);
                    rooms[myRoom].destroyTimeout = null;
                    console.log(`🔄 销毁倒计时已紧急取消！`);
                }

                rooms[myRoom][myRole] = ws;
                console.log(`成功识别身份！玩家 [${myRole}] 进入房间 [${myRoom}]`);

                if (rooms[myRoom]['P1'] && rooms[myRoom]['P2']) {
                    rooms[myRoom]['P1'].send('SYSTEM:START');
                    rooms[myRoom]['P2'].send('SYSTEM:START');
                    console.log(`房间 [${myRoom}] 玩家到齐，游戏正式开始！`);
                }
                return;
            } else {
                console.log(`❌ 虽包含JOIN，但无法从 "${msgStr}" 中解析出完整的房间号和角色！`);
            }
        }

        // 【逻辑2】无脑数据中转
        if (myRoom && rooms[myRoom]) {
            const targetRole = myRole === 'P1' ? 'P2' : 'P1';
            const targetWs = rooms[myRoom][targetRole];
            if (targetWs && targetWs.readyState === WebSocket.OPEN) {
                targetWs.send(msgStr);
            }
        }
    });
