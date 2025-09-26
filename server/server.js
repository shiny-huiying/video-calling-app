import express from 'express'
import { createServer } from 'http'
import { Server } from 'socket.io'

const app = express()
const httpServer = createServer(app)

const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', true);

  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
})

const getShortUserId = (userId) => {
  return userId.split('-')[0];
}

function findKeyByValue(map, valueToFind) {
  for (const [key, value] of map.entries()) {
    if (value === valueToFind) {
      return key;
    }
  }
  return undefined;
}
const clients = new Map()

io.on('connection', (socket) => {
  socket.on("disconnecting", (reason) => {
    console.log(`[socket]disconnecting(${socket.id})`,
      reason,
      Array.from(io.sockets.adapter.rooms.values).join(','));
  });

  socket.on('disconnect', (reason) => {
    console.log(`[socket]disconnect(${socket.id})`, reason)
    const userId = findKeyByValue(clients, socket.id)
    clients.delete(userId)
  });

  // 自定义事件
  socket.on('join', ({ roomId, userId }, callback) => {
    console.log(`客户端(${socket.id},userId:${getShortUserId(userId)})请求【加入】房间:${roomId}`)
    socket.join(roomId)

    clients.set(userId, socket.id)

    const userCount = io.sockets.adapter.rooms.get(roomId).size;
    console.log(`客户端(${socket.id},userId:${getShortUserId(userId)})【已加入】房间:${roomId}，当前房间用户数:${userCount}`);

    const userList = Array.from(clients.keys())
    socket.emit('joined', { roomId, userList });
    socket.to(roomId).emit('user-joined', { roomId, userId })

    if (callback && typeof callback === 'function') {
      callback({
        status: 'ok'
      });
    }
  })
  socket.on('leave', ({ roomId, userId }, callback) => {
    console.log(`客户端(${socket.id},userId:${getShortUserId(userId)})请求【离开】房间:${roomId}`)
    socket.leave(roomId)
    console.log(`客户端(${socket.id},userId:${getShortUserId(userId)})【已离开】房间:${roomId}`);

    clients.delete(userId)

    socket.emit('leaved', { roomId });
    socket.to(roomId).emit('user-leaved', { roomId, userId })

    if (callback && typeof callback === 'function') {
      callback({
        status: 'ok'
      });
    }
  })

  // 监听并转发 WebRTC 信令
  socket.on('signal', (roomId, data) => {
    socket.to(roomId).emit('signal', roomId, data);
  })
})

app.get('/userlist', (req, res) => {
  const userList = Array.from(clients.keys())
  res.send({
    status: 200,
    userList,
  });
})
httpServer.listen(PORT, () => {
  console.log(`信令服务器已启动，正在监听端口 ${PORT}`);
})
