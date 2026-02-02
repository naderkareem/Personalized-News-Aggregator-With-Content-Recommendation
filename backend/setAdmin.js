const mongoose = require('mongoose');
const User = require('./models/User');
require('dotenv').config();

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('MongoDB connected');
    const result = await User.updateOne(
      { email: 'admin@gmail.com' },
      { $set: { isAdmin: true } }
    );
    if (result.nModified > 0) {
      console.log('Admin status updated for admin@gmail.com');
    } else if (result.matchedCount > 0) {
      console.log('User already has admin status');
    } else {
      console.log('User not found. Please register admin@gmail.com first.');
    }
    mongoose.connection.close();
  })
  .catch(err => console.error('Error:', err));