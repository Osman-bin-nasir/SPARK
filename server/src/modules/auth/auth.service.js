const bcrypt = require('bcryptjs');
const authRepository = require('./auth.repository');
const { signToken } = require('../../utils/jwt');

function validateSignupPayload({ name, email, password }) {
  if (!name || !email || !password) {
    const error = new Error('name, email, and password are required');
    error.statusCode = 400;
    throw error;
  }

  if (password.length < 8) {
    const error = new Error('password must be at least 8 characters');
    error.statusCode = 400;
    throw error;
  }
}

function validateLoginPayload({ email, password }) {
  if (!email || !password) {
    const error = new Error('email and password are required');
    error.statusCode = 400;
    throw error;
  }
}

async function signup(payload) {
  validateSignupPayload(payload);

  const email = payload.email.trim().toLowerCase();
  const existingUser = await authRepository.findUserByEmail(email);

  if (existingUser) {
    const error = new Error('email already exists');
    error.statusCode = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(payload.password, 10);
  const user = await authRepository.createUser({
    name: payload.name.trim(),
    email,
    passwordHash
  });

  const token = signToken({ userId: user.id, email: user.email });

  return {
    message: 'signup successful',
    token,
    user
  };
}

async function login(payload) {
  validateLoginPayload(payload);

  const email = payload.email.trim().toLowerCase();
  const user = await authRepository.findUserByEmail(email);

  if (!user) {
    const error = new Error('invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const isMatch = await bcrypt.compare(payload.password, user.password_hash);

  if (!isMatch) {
    const error = new Error('invalid email or password');
    error.statusCode = 401;
    throw error;
  }

  const token = signToken({ userId: user.id, email: user.email });

  return {
    message: 'login successful',
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      created_at: user.created_at
    }
  };
}

module.exports = { signup, login };
