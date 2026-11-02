const userRepository = require('../repositories/user.repository');
const { hashPassword, verifyPassword } = require('../utils/password');
const { Errors } = require('../utils/errors');

async function register({ email, password }) {
  const existing = await userRepository.findByEmail(email);
  if (existing) throw Errors.emailTaken();

  const passwordHash = await hashPassword(password);
  const user = await userRepository.createUser(email, passwordHash);
  return userRepository.toPublicUser({ ...user, password_hash: user.passwordHash });
}

async function login({ email, password }) {
  const user = await userRepository.findByEmail(email);
  // Same generic error either way so we don't leak which emails exist.
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
    throw Errors.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  }
  return userRepository.toPublicUser({ ...user, password_hash: user.passwordHash });
}

module.exports = { register, login };
