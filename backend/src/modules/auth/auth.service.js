import { prisma } from '../../config/db.js';
import AppError from '../../shared/utils/AppError.js';
import { comparePassword } from '../../shared/utils/password.js';
import { generateAccessToken, generateRefreshToken } from '../../shared/utils/helpers.js';

const userPublicOmit = { password: true, refreshToken: true };

class AuthService {
  async login(email, password) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      throw new AppError('Invalid credentials', 401);
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      throw new AppError('Invalid credentials', 401);
    }

    const tokenPayload = { id: user.id, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const refreshToken = generateRefreshToken(tokenPayload);

    const userData = await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken },
      omit: userPublicOmit,
    });

    return { user: userData, accessToken, refreshToken };
  }

  async refresh(refreshToken) {
    const jwt = await import('jsonwebtoken');
    let decoded;

    try {
      decoded = jwt.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch {
      throw new AppError('Invalid refresh token', 401);
    }

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || user.refreshToken !== refreshToken || !user.isActive) {
      throw new AppError('Invalid refresh token', 401);
    }

    const tokenPayload = { id: user.id, role: user.role };
    const accessToken = generateAccessToken(tokenPayload);
    const newRefreshToken = generateRefreshToken(tokenPayload);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshToken },
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: { refreshToken: null },
    });
  }
}

export default new AuthService();
