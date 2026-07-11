import { prisma } from '../../config/db.js';
import AppError from '../../shared/utils/AppError.js';
import {
  comparePassword,
  compareRefreshToken,
  hashRefreshToken,
} from '../../shared/utils/password.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
} from '../../shared/utils/helpers.js';
import authSecurityService from '../../shared/services/authSecurity.service.js';

const userPublicOmit = { password: true, refreshToken: true };

function tokenPayloadFor(user) {
  return { id: user.id, role: user.role, tokenVersion: user.tokenVersion };
}

class AuthService {
  async login(email, password, { ip } = {}) {
    const user = await prisma.user.findUnique({ where: { email } });

    if (!user || !user.isActive) {
      await authSecurityService.recordFailedLogin(email, ip);
      throw new AppError('Invalid credentials', 401);
    }

    const isMatch = await comparePassword(password, user.password);
    if (!isMatch) {
      await authSecurityService.recordFailedLogin(email, ip);
      throw new AppError('Invalid credentials', 401);
    }

    const accessToken = generateAccessToken(tokenPayloadFor(user));
    const refreshToken = generateRefreshToken(tokenPayloadFor(user));
    const refreshTokenHash = await hashRefreshToken(refreshToken);

    const userData = await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: refreshTokenHash },
      omit: userPublicOmit,
    });

    return { user: userData, accessToken, refreshToken };
  }

  async refresh(refreshToken) {
    const decoded = verifyRefreshToken(refreshToken);

    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    if (!user || !user.isActive) {
      throw new AppError('Invalid refresh token', 401);
    }

    if (decoded.tokenVersion !== user.tokenVersion) {
      throw new AppError('Invalid refresh token', 401);
    }

    const tokenMatches = await compareRefreshToken(refreshToken, user.refreshToken);
    if (!tokenMatches) {
      throw new AppError('Invalid refresh token', 401);
    }

    const accessToken = generateAccessToken(tokenPayloadFor(user));
    const newRefreshToken = generateRefreshToken(tokenPayloadFor(user));
    const newRefreshTokenHash = await hashRefreshToken(newRefreshToken);

    await prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: newRefreshTokenHash },
    });

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(userId) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        refreshToken: null,
        tokenVersion: { increment: 1 },
      },
    });
  }
}

export default new AuthService();
