const fs = require('fs');
let content = fs.readFileSync('backend/src/controllers/auth.controller.js', 'utf8');
const code = `

export async function forgotPassword(req, res) {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        if (!email) return res.status(400).json({ message: 'Email is required' });
        
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(200).json({ message: 'If an account exists, an OTP will be sent' });
        }
        
        let pending = await PasswordResetOtp.findOne({ email });
        if (!pending) pending = new PasswordResetOtp({ email });
        
        const result = await issueOtp(pending, Boolean(pending.lastSentAt));
        if (result.cooldown) {
            return res.status(429).json({ message: \`Please wait \${result.cooldown} seconds before requesting another code.\` });
        }
        if (result.rateLimited) {
            return res.status(429).json({ message: 'Too many verification codes requested. Please try again later.' });
        }
        
        return res.status(200).json({ message: 'If an account exists, an OTP will be sent' });
    } catch (error) {
        console.log('Error in forgotPassword:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function verifyResetOtp(req, res) {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const otp = String(req.body.otp || '').trim();
        
        const pending = await PasswordResetOtp.findOne({ email });
        if (!pending) return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
        
        if (pending.attempts >= OTP_MAX_ATTEMPTS) {
            return res.status(429).json({ message: 'Too many verification attempts. Please request a new code.' });
        }
        if (pending.otpExpiresAt.getTime() <= Date.now()) {
            return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
        }
        
        pending.attempts += 1;
        const expectedHash = Buffer.from(pending.otpHash, 'hex');
        const receivedHash = Buffer.from(hashOtp(otp), 'hex');
        const matches = expectedHash.length === receivedHash.length && crypto.timingSafeEqual(expectedHash, receivedHash);
        
        if (!matches) {
            await pending.save();
            return res.status(400).json({ message: 'Incorrect verification code.' });
        }
        
        pending.verified = true;
        await pending.save();
        
        return res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
        console.log('Error in verifyResetOtp:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function resetPassword(req, res) {
    try {
        const email = String(req.body.email || '').trim().toLowerCase();
        const password = String(req.body.password || '');
        
        if (password.length < 8) {
            return res.status(400).json({ message: 'Password must be at least 8 characters' });
        }
        
        const pending = await PasswordResetOtp.findOne({ email, verified: true });
        if (!pending || pending.otpExpiresAt.getTime() <= Date.now()) {
            return res.status(400).json({ message: 'Session expired. Please request a new code.' });
        }
        
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        user.password = await bcrypt.hash(password, 12);
        await user.save();
        
        await PasswordResetOtp.deleteOne({ _id: pending._id });
        
        res.clearCookie(COOKIE_NAME, {
            httpOnly: true,
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            secure: process.env.NODE_ENV === 'production',
        });
        
        return res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
        console.log('Error in resetPassword:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function updatePublicKey(req, res) {
    try {
        const { publicKey } = req.body;
        if (!publicKey) return res.status(400).json({ message: 'Public key is required' });
        
        await User.findByIdAndUpdate(req.userId, { publicKey });
        return res.status(200).json({ message: 'Public key updated' });
    } catch (error) {
        console.log('Error in updatePublicKey:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}

export async function getPublicKey(req, res) {
    try {
        const { id } = req.params;
        const user = await User.findById(id).select('publicKey');
        if (!user) return res.status(404).json({ message: 'User not found' });
        return res.status(200).json({ publicKey: user.publicKey || '' });
    } catch (error) {
        console.log('Error in getPublicKey:', error.message);
        return res.status(500).json({ message: 'Internal server error' });
    }
}
`;
fs.writeFileSync('backend/src/controllers/auth.controller.js', content + code);
