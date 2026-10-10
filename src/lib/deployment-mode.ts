type DeploymentEnvironment = {
  [key: string]: string | undefined;
  EDULOOP_PRIVATE_DEPLOYMENT?: string;
};

export function registrationEnabled(environment: DeploymentEnvironment = process.env) {
  return environment.EDULOOP_PRIVATE_DEPLOYMENT !== "true";
}
