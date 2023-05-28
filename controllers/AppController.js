import dbClient from '../utils/db';
import redisClient from '../utils/redis';

class AppController {
  static getStatus(request, response) {
    const redisstatus = redisClient.isAlive();
    const dbstatus = dbClient.isAlive();
    response.status(200).send({ redis: redisstatus, db: dbstatus });
  }

  static async getStats(request, response) {
    const userdocumentsnum = await dbClient.nbUsers();
    const filesdocumentsnum = await dbClient.nbFiles();
    response.status(200).send({ users: userdocumentsnum, files: filesdocumentsnum });
  }
}
module.exports = AppController;
