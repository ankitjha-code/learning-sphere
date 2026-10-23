import type { SeedProblem } from '../types';
import { basicProblems } from './basics';
import { programmingProblems } from './programming';
import { dsaProblems } from './dsa';
import { sqlProblems } from './sql';
import { dsaAdvancedProblems } from './dsa-advanced';

export const ALL_PROBLEMS: SeedProblem[] = [...basicProblems, ...programmingProblems, ...dsaProblems, ...dsaAdvancedProblems, ...sqlProblems];
