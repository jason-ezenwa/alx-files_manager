import { createClient } from 'redis';
import { promisify } from 'util';

// class to define methods for redis commands
class RedisClient {
  constructor() {
    this.client = createClient();
    this.client.on('error', (error) => {
      console.log(`Redis client not connected to server: ${error}`);
    });
  }

  // check connection status and report
  isAlive() {
    if (this.client.connected) {
      return true;
    }
    return false;
  }

  // get value for given key from redis server
  async get(key) {
    const getCommand = promisify(this.client.get).bind(this.client);
    const value = await getCommand(key);
    return value;
  }

  // set key value pair to redis server
  async set(key, value, time) {
    const setCommand = promisify(this.client.set).bind(this.client);
    await setCommand(key, value);
    await this.client.expire(key, time);
  }

  // del key value pair from redis server
  async del(key) {
    const delCommand = promisify(this.client.del).bind(this.client);
    await delCommand(key);
  }
}

const redisClient = new RedisClient();

module.exports = redisClient;
