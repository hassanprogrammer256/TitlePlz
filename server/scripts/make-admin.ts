/**
 * Grant or revoke administrator access.
 *   npm run admin:grant -- <username>
 *   npm run admin:grant -- <username> --revoke
 * Run it on the machine that has the production DATABASE_URL; there is no HTTP way to become admin.
 */
import { disconnectDatabase, prisma } from '../src/db/client.js';

const [username, flag] = process.argv.slice(2);
if (!username || (flag !== undefined && flag !== '--revoke')) {
  console.error('usage: npm run admin:grant -- <username> [--revoke]');
  process.exit(1);
}

const user = await prisma.user.findUnique({ where: { usernameKey: username.toLowerCase() } });
if (!user) {
  console.error(`No user named "${username}"`);
  await disconnectDatabase();
  process.exit(1);
}
const isAdmin = flag !== '--revoke';
await prisma.user.update({ where: { id: user.id }, data: { isAdmin } });
console.log(`${user.handle} is ${isAdmin ? 'now' : 'no longer'} an administrator`);
await disconnectDatabase();
