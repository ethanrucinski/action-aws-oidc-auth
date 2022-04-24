# Action AWS OIDC Auth

This action is meant to be used in tandem with a custom lambda function to validate arbitrary OIDC claims in the GitHub actions token for AWS. IAM will validate the sub, iss, and aud claims in an IAM trust relationship policy, but will not enforce controls on any other OIDC claims present in the GitHub actions token.

To solve this constraint, we introduce a lambda function, invoked by a role assumed using the regular AssumeRoleWithWebIdentity approach. The lambda function performs custom claims on our GitHub actions OIDC token, and AssumesRole into our destination role if we meet all of the claims.

A sample implementation of this lambda function is available under [oidc-validator-lambda-source](./oidc-validator-lambda-source/). The CloudFormation to deploy this Lambda and the necessary roles can be found under [oidc-validator-cloudformation](./oidc-validator-cloudformation/).

## Usage

```yaml
- name: AWS Auth
  uses: ethanrucinski/action-aws-oidc-auth@v1
  with:
      initial-role-to-assume:
      # The role you intend to assume using the regular assume role with GitHub OIDC token
      # This role will be used to invoke the lambda function validating custom claims
      # required: true
      aws-region:
      # The region where you want to assume both roles and where your lambda function is deployed
      # required: false
      # default: us-east-1
      lambda-function-name:
      # The name of the lambda function used to perform your custom OIDC claim validation
      # required: true
```

## Example

```yaml
- name: AWS Auth
  uses: ethanrucinski/action-aws-oidc-auth@main
  with:
      initial-role-to-assume: arn:aws:iam::123456789:role/github-oidc-role
      aws-region: us-east-2
      lambda-function-name: github-oidc-auth
```

The above example assumes a role named `github-oidc-role` in account `123456789` and region `us-east-2`, and uses that role to invoke a function named `github-oidc-auth`, which should return credentials for the final role meant to be assumed.
