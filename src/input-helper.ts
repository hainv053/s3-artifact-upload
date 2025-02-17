import * as core from "@actions/core";
import { Inputs, NoFileOptions } from "./constants";
import { UploadInputs } from "./upload-inputs";

/**
 * Helper to get all the inputs for the action
 */
export function getInputs(): UploadInputs {
  const name = core.getInput(Inputs.Name);
  const path = core.getInput(Inputs.Path, { required: true });

  const ifNoFilesFound = core.getInput(Inputs.IfNoFilesFound);
  const noFileBehavior: NoFileOptions = NoFileOptions.error;
  const s3Bucket = core.getInput(Inputs.S3Bucket);
  const s3Prefix = core.getInput(Inputs.S3Prefix);
  const s3Endpoint = core.getInput(Inputs.S3Endpoint);
  const s3AccessKey = core.getInput(Inputs.S3AccessKey);
  const s3SecretAccessKey = core.getInput(Inputs.S3SecretAccessKey);
  const region = core.getInput(Inputs.Region);

  if (!noFileBehavior) {
    core.setFailed(
      `Unrecognized ${
        Inputs.IfNoFilesFound
      } input. Provided: ${ifNoFilesFound}. Available options: ${Object.keys(
        NoFileOptions,
      )}`,
    );
  }

  const inputs = {
    artifactName: name,
    searchPath: path,
    ifNoFilesFound: noFileBehavior,
    s3Bucket: s3Bucket,
    s3Prefix: s3Prefix,
    s3Endpoint: s3Endpoint,
    s3AccessKey: s3AccessKey,
    s3SecretAccessKey: s3SecretAccessKey,
    region: region,
  } as UploadInputs;

  const retentionDaysStr = core.getInput(Inputs.RetentionDays);
  if (retentionDaysStr) {
    inputs.retentionDays = parseInt(retentionDaysStr);
    if (isNaN(inputs.retentionDays)) {
      core.setFailed("Invalid retention-days");
    }
  }

  return inputs;
}
