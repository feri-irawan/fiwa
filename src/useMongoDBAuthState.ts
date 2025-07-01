import { initAuthCreds, proto as WAProto } from 'baileys';
import { Binary, MongoClient } from 'mongodb';

let mongoClient: MongoClient | null = null;

/**
 * Get an existing connected MongoDB client.
 */
const getMongoClient = async (dbUri: string) => {
  if (!mongoClient) {
    mongoClient = new MongoClient(dbUri);
    await mongoClient.connect();
    console.log('MongoDB client connected');
  }
  return mongoClient;
};

/**
 * Converts a MongoDB Binary to a Node.js Buffer.
 */
const convertBinaryToBuffer = (data: any): any => {
  if (data && typeof data === 'object') {
    if (data instanceof Binary) {
      return data.buffer;
    }
    for (const key in data) {
      data[key] = convertBinaryToBuffer(data[key]);
    }
  }
  return data;
};

/**
 * Logout from MongoDB by dropping the collection.
 */
export const logoutInMongoDB = async (
  dbUri: string,
  dbName: string,
  collectionName: string,
) => {
  const client = await getMongoClient(dbUri);
  const db = client.db(dbName);
  const collections = await db
    .listCollections({ name: collectionName })
    .toArray();
  if (collections.length > 0) {
    await db.dropCollection(collectionName);
    console.log(`Collection '${collectionName}' dropped`);
  } else {
    console.log(`Collection '${collectionName}' does not exist`);
  }
  await client.close();
  mongoClient = null;
  console.log('MongoDB connection closed');
};

/**
 * Adapter to store authentication state in a NoSQL database (MongoDB)
 */
export const useMongoDBAuthState = async (
  dbUri: string,
  dbName: string,
  collectionName: string,
) => {
  const client = await getMongoClient(dbUri);
  const db = client.db(dbName);
  const collection = db.collection(collectionName);

  const writeData = async (data: any, key: string) => {
    await collection.updateOne(
      { key },
      { $set: { key, data } },
      { upsert: true },
    );
  };

  const readData = async (key: string) => {
    const result = await collection.findOne({ key });
    return result ? convertBinaryToBuffer(result.data) : null;
  };

  const removeData = async (key: string) => {
    await collection.deleteOne({ key });
  };

  const creds = (await readData('creds')) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type: string, ids: string[]) => {
          const data: Record<string, any> = {};
          await Promise.all(
            ids.map(async (id) => {
              let value = await readData(`${type}-${id}`);
              if (type === 'app-state-sync-key' && value) {
                value = WAProto.Message.AppStateSyncKeyData.fromObject(value);
              }
              data[id] = value;
            }),
          );
          return data;
        },
        set: async (data: Record<string, Record<string, any>>) => {
          const tasks: Promise<void>[] = [];
          for (const category in data) {
            for (const id in data[category]) {
              const value = data[category][id];
              const key = `${category}-${id}`;
              tasks.push(value ? writeData(value, key) : removeData(key));
            }
          }
          await Promise.all(tasks);
        },
      },
    },
    saveCreds: () => {
      return writeData(creds, 'creds');
    },
  };
};
