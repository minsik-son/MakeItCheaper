import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import compareRouter from './routes/compare';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;


const whitelist = [
  'https://make-it-cheaper.vercel.app',
  'https://make-it-cheaper-git-featur-5ccc15-minsik-sons-projects-d87de25c.vercel.app',
  'https://make-it-cheaper-8ok8td17g-minsik-sons-projects-d87de25c.vercel.app'
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // origin이 없거나(서버 간 요청), whitelist에 있거나, chrome-extension:// 으로 시작하면 허용
    if (!origin || whitelist.indexOf(origin) !== -1 || origin.startsWith('chrome-extension://')) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
};

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/compare', compareRouter);

app.get('/', (req, res) => {
  res.send('MakeItCheaper Backend is running');
    console.log("CORS : ", corsOptions);
    console.log("Whitelist : ", whitelist);
    console.log("Origin : ", req.headers.origin);
});

// Export for Vercel
export default app;

// Only start server if not running in Vercel (serverless)
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}