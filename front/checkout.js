document.getElementById('complete-order').addEventListener('click', function() {
  // Get form data
  const shippingForm = document.getElementById('shipping-form');
  const paymentForm = document.getElementById('payment-form');

  if (shippingForm.checkValidity() && paymentForm.checkValidity()) {
    // Get shipping info
    const shippingInfo = {
      name: document.getElementById('name').value,
      address: document.getElementById('address').value,
      city: document.getElementById('city').value,
      zip: document.getElementById('zip').value,
      country: document.getElementById('country').value,
    };

    // Get payment info
    const paymentInfo = {
      cardType: 'Visa',  // Example: you can extend this based on card type
      last4Digits: document.getElementById('card-number').value.slice(-4),  // Last 4 digits of the card
    };

    // Example products array (you can dynamically get this from the cart page)
    const products = [
      { name: 'Product Name 1', price: 29.99, quantity: 1 },
      { name: 'Product Name 2', price: 39.99, quantity: 2 }
    ];

    const total = products.reduce((sum, product) => sum + (product.price * product.quantity), 0);

    // Prepare order data
    const orderData = { shippingInfo, paymentInfo, products, total };

    // Send order data to backend
    fetch('http://localhost:3000/api/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    })
    .then(response => response.json())
    .then(data => {
      if (data.orderNumber) {
        // Redirect to order confirmation page with order number
        window.location.href = `order-confirmation.html?orderNumber=${data.orderNumber}`;
      } else {
        alert('There was an error placing your order.');
      }
    })
    .catch(error => {
      console.error('Error:', error);
      alert('Error submitting your order.');
    });
  } else {
    alert('Please fill out all fields correctly.');
  }
});
