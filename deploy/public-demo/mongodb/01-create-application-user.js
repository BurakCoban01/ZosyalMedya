const databaseName = process.env.MONGO_APP_DATABASE ?? process.env.MONGO_INITDB_DATABASE;
const username = process.env.MONGO_APP_USERNAME;
const password = process.env.MONGO_APP_PASSWORD;

if (!databaseName || !username || !password) {
  throw new Error('MongoDB application-user bootstrap requires database, username and password.');
}

const database = db.getSiblingDB(databaseName);
const user = database.getUser(username);
const definition = {
  pwd: password,
  roles: [{ role: 'readWrite', db: databaseName }]
};

if (user) {
  database.updateUser(username, definition);
} else {
  database.createUser({ user: username, ...definition });
}
