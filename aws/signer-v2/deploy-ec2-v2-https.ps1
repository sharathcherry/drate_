$ErrorActionPreference = "Stop"

# NOTE:
# This script configures HTTPS for the existing signer on EC2 using:
# - Nginx reverse proxy on :443 -> signer on :3100
# - Let's Encrypt cert via certbot for EC2 public DNS
#
# It also ensures EC2 Security Group allows inbound 80/443.

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

$inst = aws ec2 describe-instances --region $region --instance-ids $instanceId --query "Reservations[0].Instances[0].{Az:Placement.AvailabilityZone,Dns:PublicDnsName,Ip:PublicIpAddress,Sg:SecurityGroups[0].GroupId}" --output json | ConvertFrom-Json

if (-not $inst.Dns) {
  throw "Instance has no PublicDnsName. Cannot provision HTTPS certificate."
}

# Ensure SG allows HTTP + HTTPS from internet
try { aws ec2 authorize-security-group-ingress --region $region --group-id $inst.Sg --ip-permissions '[{"IpProtocol":"tcp","FromPort":80,"ToPort":80,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]' | Out-Null } catch {}
try { aws ec2 authorize-security-group-ingress --region $region --group-id $inst.Sg --ip-permissions '[{"IpProtocol":"tcp","FromPort":443,"ToPort":443,"IpRanges":[{"CidrIp":"0.0.0.0/0"}]}]' | Out-Null } catch {}

$pubKey = Get-Content .\copilot_tmp_ec2key.pub -Raw
aws ec2-instance-connect send-ssh-public-key --region $region --instance-id $instanceId --availability-zone $inst.Az --instance-os-user ubuntu --ssh-public-key "$pubKey" | Out-Null

$sshHost = "ubuntu@$($inst.Dns)"
$tmpEnv = Join-Path $env:TEMP "drate-upload-signer-v2.env"
$tmpService = Join-Path $env:TEMP "drate-upload-signer-v2.service"
$tmpNginxConf = Join-Path $env:TEMP "drate-upload-signer-v2.nginx.conf"

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

@"
server {
    listen 80;
    server_name $($inst.Dns);

    location / {
        proxy_pass http://127.0.0.1:3100;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
"@ | Set-Content -Path $tmpNginxConf -NoNewline

ssh -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key $sshHost "mkdir -p $remoteDir"
scp -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key (Join-Path $sourceDir "package.json") "${sshHost}:$remoteDir/package.json"
scp -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key (Join-Path $sourceDir "server.mjs") "${sshHost}:$remoteDir/server.mjs"
scp -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key $tmpEnv "${sshHost}:$remoteDir/.env"
scp -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key $tmpService "${sshHost}:$remoteDir/drate-upload-signer-v2.service"
scp -o StrictHostKeyChecking=no -o ConnectTimeout=12 -i .\copilot_tmp_ec2key $tmpNginxConf "${sshHost}:$remoteDir/drate-upload-signer-v2.nginx.conf"

$certbotEmail = "admin@$($inst.Dns)"
$remoteCmd = @"
set -e
cd $remoteDir
npm install --omit=dev --no-fund --no-audit
chmod 600 .env
sudo cp $remoteDir/drate-upload-signer-v2.service /etc/systemd/system/drate-upload-signer-v2.service
sudo systemctl daemon-reload
sudo systemctl enable --now drate-upload-signer-v2
sudo apt-get update -y
sudo apt-get install -y nginx certbot python3-certbot-nginx
sudo cp $remoteDir/drate-upload-signer-v2.nginx.conf /etc/nginx/sites-available/drate-upload-signer-v2
sudo ln -sf /etc/nginx/sites-available/drate-upload-signer-v2 /etc/nginx/sites-enabled/drate-upload-signer-v2
if [ -f /etc/nginx/sites-enabled/default ]; then sudo rm -f /etc/nginx/sites-enabled/default; fi
sudo nginx -t
sudo systemctl reload nginx
sudo certbot --nginx -d $($inst.Dns) --non-interactive --agree-tos -m $certbotEmail --redirect
curl -sS https://$($inst.Dns)/health
"@

ssh -o StrictHostKeyChecking=no -o ConnectTimeout=20 -i .\copilot_tmp_ec2key $sshHost $remoteCmd

Write-Host ""
Write-Host "HTTPS_SIGNER_URL=https://$($inst.Dns)/api/sign-upload"
Write-Host "Set VITE_UPLOAD_SIGN_URL to that URL and rebuild mobile app."
