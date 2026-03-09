import dotenv from 'dotenv';
import path   from 'path';
import { getN42Home } from './cli/paths.js';

dotenv.config({ path: path.join(getN42Home(), '.env.local'), quiet: true });