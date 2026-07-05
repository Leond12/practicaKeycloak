function success(message, data = {}) {
  return {
    success: true,
    message,
    data
  };
}

function error(code, message) {
  return {
    success: false,
    error: {
      code,
      message
    }
  };
}

module.exports = {
  success,
  error
};
