const request = require('supertest');
const app = require('../index');

describe('Authentication API Tests', () => {
    
    test('POST /api/auth/register - should register new user', async () => {
        const res = await request(app)
            .post('/api/auth/register')
            .send({
                name: 'Test User',
                email: 'test@example.com',
                password: '123456'
            });
        
        expect(res.statusCode).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.token).toBeDefined();
    });
    
    test('POST /api/auth/login - should login user', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                password: '123456'
            });
        
        expect(res.statusCode).toBe(200);
        expect(res.body.token).toBeDefined();
    });
    
    test('POST /api/auth/login - wrong password should fail', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({
                email: 'test@example.com',
                password: 'wrongpassword'
            });
        
        expect(res.statusCode).toBe(401);
        expect(res.body.success).toBe(false);
    });
});