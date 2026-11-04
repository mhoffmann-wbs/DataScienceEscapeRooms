import { instructorConfigSchema, type InstructorConfig } from './instructor';

// content/instructor.json, written by `npm run instructor-keys`. Optional: without it there is
// no instructor mode, and instructor messages are ignored.
const files = import.meta.glob<unknown>('../../content/instructor.json', { eager: true, import: 'default' });
const raw = Object.values(files)[0];

export const INSTRUCTOR_CONFIG: InstructorConfig | null = raw === undefined ? null : instructorConfigSchema.parse(raw);
