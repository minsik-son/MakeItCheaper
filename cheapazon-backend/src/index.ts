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
  'https://make-it-cheaper-8ok8td17g-minsik-sons-projects-d87de25c.vercel.app',
  'https://make-it-cheaper-git-develop-minsik-sons-projects-d87de25c.vercel.app',
  'https://make-it-cheaper-git-feature-minsik-sons-projects-d87de25c.vercel.app'
];

const corsOptions: cors.CorsOptions = {
  origin: (origin, callback) => {
    // Log all incoming Origin values to Vercel for debugging.
    console.log("DEBUG: Incoming Request Origin ->", origin);

    if (!origin || whitelist.indexOf(origin) !== -1 || origin.startsWith('chrome-extension://')) {
      console.log("DEBUG: CORS Allowed for ->", origin);
      callback(null, true);
    } else {
      console.log("DEBUG: CORS Rejected for ->", origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  // Specify methods and headers for preflight requests to work correctly.
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

app.use('/api/compare', compareRouter);

app.get('/', (req, res) => {
  // Log the Origin header from the current request.
  console.log("Request Method:", req.method);
  console.log("Request Origin Header:", req.headers.origin);
  res.send('Deep Match Backend is running');
});

// Export for Vercel
export default app;

// Only start server if not running in Vercel (serverless)
if (!process.env.VERCEL) {
  app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
  });
}