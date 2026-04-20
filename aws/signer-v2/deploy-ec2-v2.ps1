$ErrorActionPreference = "Stop"

$accessKey = $env:AWS_ACCESS_KEY_ID
$secretKey = $env:AWS_SECRET_ACCESS_KEY

if (-not $accessKey -or -not $secretKey) {
  throw "Set AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY in your environment before running this script."
}

$instanceId = "i-0edd92d9185f3332c"
$region = "ap-south-1"
$sourceDir = $PSScriptRoot
$remoteDir = "/home/ubuntu/drate-upload-signer-v2"

$env:AWS_ACCESS_KEY_ID = $accessKey
$env:AWS_SECRET_ACCESS_KEY = $secretKey
$env:AWS_DEFAULT_REGION = $region
$env:AWS_PAGER = ""

Set-Location $env:TEMP
if (!(Test-Path .\copilot_tmp_ec2key)) {
  ssh-keygen -t rsa -b 2048 -f .\copilot_tmp_ec2key -N "" | Out-Null
}

$inst = aws ec2 describe-instances --region $region --instance-ids $instanceId --query "Reservations[0].Instances[0].{Az:Placement.AvailabilityZone,Dns:PublicDnsName,Ip:PublicIpAddress}" --output json | ConvertFrom-Json
$pubKey = Get-Content .\copilot_tmp_ec2key.pub -Raw
aws ec2-instance-connect send-ssh-public-key --region $region --instance-id $instanceId --availability-zone $inst.Az --instance-os-user ubuntu --ssh-public-key "$pubKey" | Out-Null

$sshHost = "ubuntu@$($inst.Dns)"
$tmpEnv = Join-Path $env:TEMP "drate-upload-signer-v2.env"
$tmpService = Join-Path $env:TEMP "drate-upload-signer-v2.service"

@"
PORT=3100
AWS_ACCOUNT_ID=752224033369
AWS_REGION=ap-south-1
AWS_S3_BUCKET=drate-uploads-752224033369-20260419113259
AWS_ACCESS_KEY_ID=$accessKey
AWS_SECRET_ACCESS_KEY=$secretKey
AWS_S3_PUBLIC_BASE_URL=https://drate-uploads-752224033369-20260419113259.s3.ap-south-1.amazonaws.com
FIREBASE_PROJECT_ID=myapplication-dc877d91
SIGNED_URL_TTL_SECONDS=300
"@ | Set-Content -Path $tmpEnv -NoNewline

@"
[Unit]
Description=Drate Upload Signer API V2
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/drate-upload-signer-v2
EnvironmentFile=/home/ubuntu/drate-upload-signer-v2/.env
ExecStart=/usr/bin/node /home/ubuntu/drate-upload-signer-v2/server.mjs
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"@ | Set-Content -Path $tmpService -NoNewline

ssh -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key $sshHost "mkdir -p $remoteDir"
scp -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key (Join-Path $sourceDir "package.json") "${sshHost}:$remoteDir/package.json"
scp -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key (Join-Path $sourceDir "server.mjs") "${sshHost}:$remoteDir/server.mjs"
scp -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key $tmpEnv "${sshHost}:$remoteDir/.env"
scp -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key $tmpService "${sshHost}:$remoteDir/drate-upload-signer-v2.service"

$remoteCmd = "set -e; cd $remoteDir; npm install --omit=dev --no-fund --no-audit; chmod 600 .env; sudo cp $remoteDir/drate-upload-signer-v2.service /etc/systemd/system/drate-upload-signer-v2.service; sudo systemctl daemon-reload; sudo systemctl enable --now drate-upload-signer-v2; sudo systemctl --no-pager --full status drate-upload-signer-v2 | sed -n '1,40p'; curl -sS http://127.0.0.1:3100/health"
ssh -o StrictHostKeyChecking=no -o ConnectTimeout=15 -i .\copilot_tmp_ec2key $sshHost $remoteCmd

Write-Host "NEW_SIGNER_URL=http://$($inst.Ip):3100/api/sign-upload"
