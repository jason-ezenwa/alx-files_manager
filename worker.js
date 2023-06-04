const Queue = require('bull');
import { ObjectID } from 'mongodb';
const imageThumbnail = require('image-thumbnail');
import dbClient from '../utils/db';

const fileQueue = Queue('file queue');
fileQueue.process(async function(job, done) {
  if (!job.data.userId) {
    throw new Error('Missing userId');
  }
  if (!job.data.fileId) {
    throw new Error('Missing fileId');
  }
  const userObjId = new ObjectID(userId);
  const fileObjId = new ObjectID(fileId);
  const files = dbClient.db.collection('files');
  const searchedFile = await files.findOne({ _id: fileObjId, userId: userObjId });
  if (!searchedFile) {
    throw new Error ('File not found')
  }
  try {
    const fiveHundredThumbnail = await imageThumbnail(searchedFile.localPath, { width: 500 });
    console.log(fiveHundredThumbnail);
    try {
      const filePath = searchedFile.localPath + '_500'
      await fs.writeFile(filePath, fiveHundredThumbnail);
    } catch (error) {
      console.log(error);
    }
    const twoFiftyThumbnail = await imageThumbnail(searchedFile.localPath, { width: 250 });
    console.log(twoFiftyThumbnail);
    try {
      const filePath = searchedFile.localPath + '_250'
      await fs.writeFile(filePath, twoFiftyThumbnail);
    } catch (error) {
      console.log(error);
    }
    const oneHundredThumbnail = await imageThumbnail(searchedFile.localPath, { width: 100 });
    console.log(oneHundredThumbnail);
    try {
      const filePath = searchedFile.localPath + '_250'
      await fs.writeFile(filePath, oneHundredThumbnail);
    } catch (error) {
      console.log(error);
    }
  } catch (err) {
      console.error(err);
  }
  
})
