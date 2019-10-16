//https://docs.microsoft.com/en-us/azure/storage/blobs/storage-quickstart-blobs-nodejs

var azure = require('azure-storage');
const uuid = require('uuid/v1');
const request = require('request');

var blobService = azure.createBlobService();

const listContainers = async () => {
  return new Promise((resolve, reject) => {
      blobService.listContainersSegmented(null, (err, data) => {
          if (err) {
              reject(err);
          } else {
              resolve({ message: `${data.entries.length} containers`, containers: data.entries });
          }
      });
  });
};

const createContainer = async (containerName) => {
  return new Promise((resolve, reject) => {
      blobService.createContainerIfNotExists(containerName, { publicAccessLevel: 'blob' }, err => {
          if (err) {
              reject(err);
          } else {
              resolve({ message: `Container '${containerName}' created` });
          }
      });
  });
};

const uploadBuffer = async (containerName, blobName, buffer) => {
  return new Promise((resolve, reject) => {
      blobService.createBlockBlobFromText(containerName, blobName, buffer, err => {
          if (err) {
              reject(err);
          } else {
              resolve({ message: `Text "${buffer}" is written to blob storage` });
          }
      });
  });
};

const uriBase = 'https://eastus2.api.cognitive.microsoft.com/';
const subscriptionKey = process.env['COGNITIVE_SERVICES_KEY'];
const personGroupId = "stappy";

const detectFace = async (imageUrl) => {
  const params = {
    'returnFaceId': 'true',
    'recognitionModel': 'recognition_02'
  };

  const options = {
    uri: uriBase+"face/v1.0/detect",
    qs: params,
    body: '{"url": ' + '"' + imageUrl + '"}',
    headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key' : subscriptionKey
    }
  };

  return new Promise((resolve, reject) => {
    request.post(options, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }
      let jsonResponse = JSON.parse(body);
      resolve(jsonResponse);
    });
  });
}

const getPersonId = async (faceId) => {
  const body = {
    "personGroupId": personGroupId,
    "faceIds": [faceId],
    "maxNumOfCandidatesReturned": 1,
    "confidenceThreshold": 0.5
  };
  const options = {
    uri: uriBase+"face/v1.0/identify",
    body: JSON.stringify(body),
    headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key' : subscriptionKey
    }
  };

  return new Promise((resolve, reject) => {
    request.post(options, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }
      let jsonResponse = JSON.parse(body);
      resolve(jsonResponse);
    });
  });
}

const getPerson = async (personId) => {
  const options = {
    uri: uriBase+"/face/v1.0/persongroups/"+personGroupId+"/persons/"+personId,
    headers: {
        'Content-Type': 'application/json',
        'Ocp-Apim-Subscription-Key' : subscriptionKey
    }
  };

  return new Promise((resolve, reject) => {
    request.get(options, (error, response, body) => {
      if (error) {
        reject(error);
        return;
      }
      let jsonResponse = JSON.parse(body);
      resolve(jsonResponse);
    });
  });
}


module.exports = async function (context, req) {

  if(req.body.img==null){
    context.res = {
      status: 400,
      body: "Missing img data"
    };
    context.done();
    return;
  }
  var string = req.body.img;
  var regex = /^data:.+\/(.+);base64,(.*)$/;

  var matches = string.match(regex);
  var ext = matches[1];
  var data = matches[2];
  var fileName = uuid()+"."+ext;
  var buffer = new Buffer(data, 'base64');

  response = await listContainers();
  const containerName = "$web";
  const blobName = "tmp/" + fileName;
  const containerDoesNotExist = response.containers.findIndex((container) => container.name === containerName) === -1;
  if (containerDoesNotExist) {
    await createContainer(containerName);
    console.log(`Container "${containerName}" is created`);
  }
  await uploadBuffer(containerName, blobName, buffer);

  console.log(`Blob "${blobName}" is uploaded`);

  //faceId=$(curl -H "$header" "https://${endpoint}/face/v1.0/detect?recognitionModel=recognition_02"  -H "Content-Type: application/json" --data-ascii "{\"url\": \"https://pl.gravatar.com/userimage/48672464/c50835d7095c6bf97f05a434fa54cfca.jpg?size=512\"}" | jq -r '.[0].faceId')
  // https://docs.microsoft.com/en-us/azure/cognitive-services/face/QuickStarts/node

  const publicUrl = "https://storage0warsztaty0test.z20.web.core.windows.net/"+blobName;
  let body = await detectFace(publicUrl);
  const faceId = body[0].faceId;
  body = await getPersonId(faceId);
  const personId = body[0].candidates[0].personId;
  body = await getPerson(personId);

  context.res = {
    body: { name: body.name, description: body.userData },
    headers: {
      'Content-Type': 'application/json'
    }
  };
  context.done();
};