const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')('your-stripe-secret-key'); // Provide Stripe secret key directly
const nodemailer = require('nodemailer');

// Initialize Express
const app = express();
const port = 3000; // Use a direct value for port

// Middleware
app.use(cors());
app.use(bodyParser.json());

// MongoDB Connection
const mongoUri = 'mongodb://localhost:27017/ecom';// Provide MongoDB URI directly
mongoose.connect(mongoUri)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Define a route for the root URL
app.get('/', (req, res) => {
  res.send('Welcome to Style Hub!');
});

// User Schema & Model
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password
userSchema.methods.comparePassword = async function (password) {
  return await bcrypt.compare(password, this.password);
};

const User = mongoose.model('User', userSchema);

// Product Schema & Model
const productSchema = new mongoose.Schema({
  name: String,
  description: String,
  price: Number,
  imageUrl: String,
});
const Product = mongoose.model('Product', productSchema);

// Order Schema & Model
const orderSchema = new mongoose.Schema({
  userId: String,
  products: Array,
  total: Number,
  createdAt: { type: Date, default: Date.now },
});
const Order = mongoose.model('Order', orderSchema);

// Nodemailer Configuration
const transporter = nodemailer.createTransport({
  service: 'gmail', // Change if needed
  auth: {
    user: 'your-email@gmail.com', // Provide email directly
    pass: 'your-email-password', // Provide email password directly
  },
});

// Authentication Middleware
const authenticate = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) return res.status(401).json({ message: 'Access denied' });
  jwt.verify(token, 'your-jwt-secret', (err, decoded) => { // Provide JWT secret directly
    if (err) return res.status(400).json({ message: 'Invalid token' });
    req.userId = decoded.userId;
    next();
  });
};

// User Registration
app.post('/api/register', async (req, res) => {
  const { email, password } = req.body;

  // Check for missing fields
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  // Validate email format
  const emailRegex = /^[a-zA-Z0-9._-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,6}$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ message: 'Invalid email format.' });
  }

  try {
    // Check if the email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'Email already in use.' });
    }

    // Create a new user
    const user = new User({ email, password });
    await user.save();
    res.status(201).json({ message: 'User registered successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error registering user: ' + err.message });
  }
});

// Login Log Schema & Model
const loginLogSchema = new mongoose.Schema({
  email: { type: String, required: true },
  loginTime: { type: Date, default: Date.now },
  status: { type: String, enum: ['Success', 'Failure'], required: true },
});
const LoginLog = mongoose.model('LoginLog', loginLogSchema);

// User Login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  try {
    const user = await User.findOne({ email });
    if (!user) {
      // Log failed attempt
      await new LoginLog({ email, status: 'Failure' }).save();
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      // Log failed attempt
      await new LoginLog({ email, status: 'Failure' }).save();
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign({ userId: user._id }, 'your-jwt-secret', { expiresIn: '1h' }); // Provide JWT secret directly

    // Log successful attempt
    await new LoginLog({ email, status: 'Success' }).save();

    res.status(200).json({ token });
  } catch (err) {
    console.error(err.message);
    res.status(500).json({ message: 'Server error' });
  }
});

// Add Product (Admin Only)
app.post('/api/products', authenticate, async (req, res) => {
  const { name, description, price, imageUrl } = req.body;
  try {
    const product = new Product({ name, description, price, imageUrl });
    await product.save();
    res.status(201).json({ message: 'Product added' });
  } catch (err) {
    res.status(400).json({ message: 'Error adding product: ' + err.message });
  }
});

// Get Products
app.get('/api/products', async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json(products);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching products: ' + err.message });
  }
});

// Create Payment Intent (Stripe)
app.post('/api/create-payment-intent', async (req, res) => {
  try {
    const { amount } = req.body; // Amount in cents
    const paymentIntent = await stripe.paymentIntents.create({
      amount,
      currency: 'usd',
      payment_method_types: ['card'],
    });
    res.status(200).json({ clientSecret: paymentIntent.client_secret });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Place Order
app.post('/api/orders', authenticate, async (req, res) => {
  const { products, total } = req.body;
  try {
    const order = new Order({ userId: req.userId, products, total });
    await order.save();

    // Send Email Confirmation
    const user = await User.findById(req.userId);
    const mailOptions = {
      from: 'your-email@gmail.com', // Provide email directly
      to: user.email,
      subject: 'Order Confirmation',
      text: `Thank you for your order! Order total: $${total / 100}.`,
    };
    await transporter.sendMail(mailOptions);

    res.status(201).json({ message: 'Order placed and confirmation email sent' });
  } catch (err) {
    res.status(400).json({ message: 'Error placing order: ' + err.message });
  }
});

// Get Orders for User
app.get('/api/orders', authenticate, async (req, res) => {
  try {
    const orders = await Order.find({ userId: req.userId });
    res.status(200).json(orders);
  } catch (err) {
    res.status(500).json({ message: 'Error fetching orders: ' + err.message });
  }
});

// Endpoint to handle contact form submission
app.post('/api/contact', async (req, res) => {
  const { name, email, message } = req.body;

  try {
      // Create a new contact document
      const contact = new Contact({ name, email, message });
      
      // Save the document to the database
      await contact.save();

      console.log('Contact form submission saved:', contact);

      // Send email notification
      const mailOptions = {
          from: 'your-email@gmail.com',
          to: 'your-email@gmail.com',
          subject: 'New Contact Form Submission',
          text: `You have a new contact form submission:
                Name: ${name}
                Email: ${email}
                Message: ${message}`
      };

      transporter.sendMail(mailOptions, (error, info) => {
          if (error) {
              return console.error('Error sending email:', error);
          }
          console.log('Email sent:', info.response);
      });

      res.status(200).json({ message: 'Message received successfully!' });
  } catch (err) {
      console.error('Error saving contact form submission:', err.message);
      res.status(500).json({ message: 'Internal server error' });
  }
});
  // Here you can add logic to save the data to a database or send an email

// Start the Server
app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});