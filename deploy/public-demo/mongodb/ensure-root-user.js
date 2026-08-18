const admin = db.getSiblingDB('admin');
const username = process.env.MONGO_INITDB_ROOT_USERNAME;
const password = process.env.MONGO_INITDB_ROOT_PASSWORD;

if (!username || !password) {
  throw new Error('MongoDB root-user bootstrap requires username and password.');
}

admin.createUser({
  user: username,
  pwd: password,
  roles: [{ role: 'root', db: 'admin' }]
});
