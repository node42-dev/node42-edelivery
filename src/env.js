import dotenv from 'dotenv';
import path   from 'path';
import { getN42Home } from './cli/paths.js';

const environment = process.env.N42_ENV ?? 'test';
dotenv.config({ path: path.join(getN42Home(), `.env.${environment}`), quiet: true });