const express = require('express');
const http = require('http');
const cors = require('cors');
const { Server } = require('socket.io');
const mongoose = require('mongoose');

mongoose.connect('mongodb://localhost:27017/food_order_management', {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.log('MongoDB connection error:', err));

const orderHistorySchema = new mongoose.Schema({
    menu: String,
    quantity: Number,
    tableNumber: Number,
    date: { type: Date, default: Date.now }, 
    isTakeaway: Boolean,
    note: String,
});

const OrderHistory = mongoose.model('OrderHistory', orderHistorySchema);

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"]
    }
});

let orders = [];

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.emit('currentOrders', orders);

    socket.on('placeOrder', async (orderDetails) => {
        console.log('Received orderDetails:', orderDetails);
     
        if (orderDetails.tableNumber !== '' && isNaN(orderDetails.tableNumber)) {
            return socket.emit('error', 'tableNumber ต้องเป็นตัวเลข');
        } else {
            orderDetails.tableNumber = Number(orderDetails.tableNumber);
        }
    
        if (orderDetails && orderDetails.menu && orderDetails.menu.trim() !== '' && orderDetails.quantity > 0) {
            orders.push(orderDetails);
     
            const newOrder = new OrderHistory(orderDetails);
            try {
                await newOrder.save();
                io.emit('newOrder', orderDetails);
            } catch (error) {
                console.error('Error saving order:', error);
            }
        } else {
            socket.emit('error', 'คำสั่งไม่ถูกต้อง');
        }
    });
    
    socket.on('deleteOrder', async (orderIndex) => {
        if (orderIndex >= 0 && orderIndex < orders.length) {
            const deletedOrder = orders.splice(orderIndex, 1);
            await OrderHistory.deleteOne({ menu: deletedOrder[0].menu, quantity: deletedOrder[0].quantity });
            io.emit('orderDeleted', orderIndex);
        }
    });

    socket.on('deleteOrder_page', (orderIndex) => {
        if (orderIndex >= 0 && orderIndex < orders.length) {
            orders.splice(orderIndex, 1);
            io.emit('orderDeleted', orderIndex);
        }
    });

    socket.on('disconnect', () => {
        console.log('A user disconnected:', socket.id);
    });
});

app.delete('/api/orders/:id', async (req, res) => {
    const { id } = req.params;

    try {
        const result = await OrderHistory.findByIdAndDelete(id);

        if (!result) {
            return res.status(404).json({ error: 'ไม่พบคำสั่งซื้อที่ต้องการลบ' });
        }

        res.status(200).json({ message: 'ลบคำสั่งซื้อเรียบร้อย' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการลบคำสั่งซื้อ' });
    }
});

app.get('/api/orders', async (req, res) => {
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'กรุณาระบุวันที่' });
    }

    try {
        const orders = await OrderHistory.find({
            date: {
                $gte: new Date(date + 'T00:00:00'), 
                $lt: new Date(date + 'T23:59:59') 
            }
        });

        res.json(orders);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'เกิดข้อผิดพลาดในการดึงข้อมูล' });
    }
});

const PORT = 5000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
