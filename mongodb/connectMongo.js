const mongoose = require('mongoose');
mongoose.set('strictQuery', false);

const uri = `mongodb://${process.env.MONGO_HOST}:${process.env.MONGO_PORT}/${process.env.MONGO_DATABASE}`;

const connectMongo = async () => {
  try {
    await mongoose.connect(uri);
    console.log(`Database ${process.env.MONGO_DATABASE} connected`);
  } catch (error) {
    console.log(error);
    process.exit(1);
  }
};

module.exports = connectMongo;
