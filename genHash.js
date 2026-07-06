const bcrypt = require('bcryptjs');
const password = 'Admin123456'; // 设置管理员密码
const hash = bcrypt.hashSync(password, 10);
console.log('Hashed password:', hash);