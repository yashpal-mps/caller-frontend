
import { rest } from 'msw';

export const handlers = [
  rest.post('/api/login', (req, res, ctx) => {
    const { email, password } = req.body as any;

    if (email === 'test@example.com' && password === 'password') {
      return res(
        ctx.status(200),
        ctx.json({
          token: 'mock-bearer-token',
        })
      );
    } else {
      return res(
        ctx.status(401),
        ctx.json({
          message: 'Invalid credentials',
        })
      );
    }
  }),
];
