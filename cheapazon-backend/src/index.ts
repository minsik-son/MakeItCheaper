import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

import compareRouter from './routes/compare';

app.use(cors());
app.use(express.json());

app.use('/api/compare', compareRouter);

app.get('/', (req, res) => {
  res.send('Cheapazon Backend is running');
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

export default app;
