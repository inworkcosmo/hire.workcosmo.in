const Razorpay = require('razorpay');
require('dotenv').config();

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ensure keys are present
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error('Missing Razorpay Keys in Environment Variables');
    return res.status(500).json({ error: 'Server configuration error: Missing API Keys' });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  const { plan_id, total_count, quantity, start_at, notes } = req.body;

  if (!plan_id) {
    return res.status(400).json({ error: 'Plan ID is required for subscriptions' });
  }

  try {
    const options = {
      plan_id: plan_id,
      total_count: total_count !== undefined ? total_count : 1, // Default to 1 cycle (1 month)
      quantity: quantity || 1,
      customer_notify: 1, // Razorpay will notify the customer
      notes: notes || {}
    };

    // If a start_at Unix timestamp is provided, schedule the subscription to begin then
    if (start_at) {
      options.start_at = start_at;
    }

    const subscription = await razorpay.subscriptions.create(options);
    
    res.status(200).json({
      subscription_id: subscription.id,
      plan_id: subscription.plan_id,
      status: subscription.status
    });
  } catch (error) {
    console.error('Razorpay Subscription Error:', error);
    const errorMessage = error.description || (error.error && error.error.description) || error.message || 'Failed to create subscription';
    res.status(500).json({ error: errorMessage });
  }
};
