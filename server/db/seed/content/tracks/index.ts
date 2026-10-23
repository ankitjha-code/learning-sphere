import type { SeedTrack } from '../types';
import { pythonFoundations } from './python-foundations';
import { javascriptEssentials } from './javascript-essentials';
import { typescriptTrack, javaTrack, cCppTrack, goTrack, rustTrack } from './languages';
import { dsaEssentials, dsaAdvanced } from './dsa';
import { sqlDatabaseDesign } from './databases';
import { oopLowLevelDesign, systemDesign, csFundamentals } from './design';
import { webFoundations, frontendReact, backendNodeApis, fullStackCapstonePath } from './web';
import { gitCollaboration, devopsCloud, qualityEngineering } from './engineering';
import { interviewReadiness, communicationWriting, placementPrep } from './career';
import { mathForCs, dataSciencePython, mlFoundations, genAiApplications } from './ai-ml';

export const ALL_TRACKS: SeedTrack[] = [
  pythonFoundations,
  javascriptEssentials,
  typescriptTrack,
  javaTrack,
  cCppTrack,
  goTrack,
  rustTrack,
  dsaEssentials,
  dsaAdvanced,
  sqlDatabaseDesign,
  oopLowLevelDesign,
  systemDesign,
  csFundamentals,
  webFoundations,
  frontendReact,
  backendNodeApis,
  fullStackCapstonePath,
  gitCollaboration,
  devopsCloud,
  qualityEngineering,
  interviewReadiness,
  communicationWriting,
  placementPrep,
  mathForCs,
  dataSciencePython,
  mlFoundations,
  genAiApplications,
];
