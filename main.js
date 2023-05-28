import redisClient from './utils/redis';

(async () => {
  console.log(redisClient.isAlive());
  console.log(await redisClient.get('myKey'));
  await redisClient.set('myKey', 12, 5);
  console.log('about to try the second get');
  console.log(await redisClient.get('myKey'));

  setTimeout(async () => {
    console.log('trying third get');
    console.log(await redisClient.get('myKey'));
  }, 1000 * 10);
})();
