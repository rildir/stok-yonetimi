-- MySQL dump 10.13  Distrib 8.0.46, for Win64 (x86_64)
--
-- Host: localhost    Database: stok_yonetimi
-- ------------------------------------------------------
-- Server version	5.5.5-10.4.32-MariaDB

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8mb4 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `suppliers`
--

DROP TABLE IF EXISTS `suppliers`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `suppliers` (
  `id` varchar(36) NOT NULL,
  `name` varchar(255) NOT NULL,
  `contactPerson` varchar(255) DEFAULT NULL,
  `email` varchar(255) DEFAULT NULL,
  `phone` varchar(255) DEFAULT NULL,
  `address` varchar(255) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `isDeleted` tinyint(4) NOT NULL DEFAULT 0,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  `rating` int(11) NOT NULL DEFAULT 5,
  `leadTimeDays` int(11) NOT NULL DEFAULT 3,
  PRIMARY KEY (`id`),
  KEY `IDX_7b53306ed78ff59215a7b77eb4` (`isDeleted`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `suppliers`
--

LOCK TABLES `suppliers` WRITE;
/*!40000 ALTER TABLE `suppliers` DISABLE KEYS */;
INSERT INTO `suppliers` VALUES ('362f2eca-e2b3-4575-b64f-96f2ff04bbab','Ofis Merkezi Ltd. ┼₧ti.','Ay┼ƒe Y─▒lmaz','satis@ofismerkezi.com','+90 555 987 6543',NULL,NULL,0,'2026-06-19 09:36:34.157458','2026-06-19 09:36:34.157458',5,3),('6a456f73-49cc-4f21-aa9a-228e67401cb4','Test Supplier 10-10','John Doe','john@example.com','123456789','123 Test St','Premium partner',0,'2026-06-19 11:44:39.524392','2026-06-19 11:44:39.524392',5,3),('89dbade9-1d2a-4cdd-bdff-b69d340120aa','Test Supplier 10-10','Test Contact','test@test.com','5551234567','','',0,'2026-06-19 11:25:47.276549','2026-06-19 11:25:47.276549',5,3),('c8d9d371-5de4-4f13-a608-da267b64e518','Tech supplies A.┼₧.','Ali Veli','info@techsupplies.com','+90 555 123 4567','Teknokent, ─░stanbul',NULL,0,'2026-06-19 09:36:34.138746','2026-06-19 09:36:34.138746',5,3),('d70dd0bd-ff78-4c82-89b1-55c7dc01ff31','Test Supplier 10-10','Test Contact','test@test.com','5551234567','Test Address','Test Notes',0,'2026-06-19 11:31:37.641095','2026-06-19 11:31:37.641095',5,3),('e9474c14-2e97-4a4a-89a1-829ae79be29b','Test Supplier 10-10','John Doe','john@example.com','123456789','123 Test St','Premium partner',0,'2026-06-19 11:45:31.090490','2026-06-19 11:45:31.090490',4,5);
/*!40000 ALTER TABLE `suppliers` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stock_counts`
--

DROP TABLE IF EXISTS `stock_counts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stock_counts` (
  `id` varchar(36) NOT NULL,
  `countNumber` varchar(255) NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'InProgress',
  `items` text NOT NULL,
  `startedAt` datetime NOT NULL,
  `completedAt` datetime DEFAULT NULL,
  `performedBy` varchar(255) NOT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_c9e9db360be03a918059dfcafc` (`countNumber`),
  KEY `IDX_4de46d2db344e171118ffa04f2` (`status`),
  KEY `IDX_9bce808517d49f6908f616fcd9` (`createdAt`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stock_counts`
--

LOCK TABLES `stock_counts` WRITE;
/*!40000 ALTER TABLE `stock_counts` DISABLE KEYS */;
INSERT INTO `stock_counts` VALUES ('18bff09e-5ca3-47fb-8f86-3bcc0d008594','SC-20260619-114613','InProgress','[{\"productId\":\"234f1601-910d-4abc-b9cf-7070b678cf6b\",\"productName\":\"Noise Cancelling Headphones\",\"sku\":\"HP-NC4\",\"systemQuantity\":14,\"countedQuantity\":14,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"461142df-89b1-4895-93e1-79e2ea581f69\",\"productName\":\"Dell UltraSharp 27\",\"sku\":\"DELL-U2722D\",\"systemQuantity\":22,\"countedQuantity\":22,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"5211a14d-1b7c-4172-95d2-a929fab32dbd\",\"productName\":\"Webcam HD 1080p\",\"sku\":\"WC-1080\",\"systemQuantity\":0,\"countedQuantity\":0,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"709dad6b-5692-42b4-a62c-d12714ae80bd\",\"productName\":\"Logitech MX Master 3S\",\"sku\":\"LOGI-MX3S-001\",\"systemQuantity\":45,\"countedQuantity\":45,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"8ea3efc3-f37e-4bab-8b9c-a0f38ce82f9e\",\"productName\":\"Laptop Stand Aluminum\",\"sku\":\"LS-ALUM\",\"systemQuantity\":80,\"countedQuantity\":80,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"989887ce-31bc-4bba-8898-bc0193691df2\",\"productName\":\"UltraWide Monitor 34\\\"\",\"sku\":\"MN-34U\",\"systemQuantity\":10,\"countedQuantity\":10,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"a1b471d5-b8bb-4675-864e-6bd011d2a8e6\",\"productName\":\"Sony WH-1000XM5\",\"sku\":\"SONY-WHXM5\",\"systemQuantity\":20,\"countedQuantity\":20,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"a359dd5e-b252-4adb-ac86-60ab1856b174\",\"productName\":\"Smart Watch Series 5\",\"sku\":\"SW-S5\",\"systemQuantity\":0,\"countedQuantity\":0,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"a9b39f00-c110-498a-8193-d1789b62c64f\",\"productName\":\"Bluetooth Speaker Portable\",\"sku\":\"SP-BT5\",\"systemQuantity\":1,\"countedQuantity\":1,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"b83aaef3-3a5a-4155-a172-65e26710f0c0\",\"productName\":\"Realtime Test Product\",\"sku\":\"RT-TEST-01\",\"systemQuantity\":5,\"countedQuantity\":5,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"c96f4ac1-1ec0-4dab-8445-2e786f29b44d\",\"productName\":\"USB-C Hub 8-in-1\",\"sku\":\"HB-81\",\"systemQuantity\":60,\"countedQuantity\":60,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"e65a113f-814e-44fd-94a6-b43c6a5c3b0d\",\"productName\":\"Mechanical Keyboard K85\",\"sku\":\"KB-85\",\"systemQuantity\":8,\"countedQuantity\":8,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"f0c3e672-73c8-41f1-9ffd-e6037ae7f1b3\",\"productName\":\"Ergonomik Ofis Koltu─ƒu\",\"sku\":\"FURN-ERGO-01\",\"systemQuantity\":3,\"countedQuantity\":3,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"f11aa47a-96b5-4101-b490-2737c44f0338\",\"productName\":\"Apple AirPods Pro 2\",\"sku\":\"AAPL-APP2\",\"systemQuantity\":25,\"countedQuantity\":25,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"f3cedb05-1378-4ecb-a073-893e7f4925bd\",\"productName\":\"Ergonomic Office Chair\",\"sku\":\"CH-ERGO\",\"systemQuantity\":3,\"countedQuantity\":3,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"fc3d0137-7fcd-4acf-946b-f5fbe143d7f5\",\"productName\":\"Wireless Mouse M320\",\"sku\":\"MS-320\",\"systemQuantity\":45,\"countedQuantity\":45,\"difference\":0,\"unit\":\"Adet\"}]','2026-06-19 11:46:13',NULL,'Admin','','2026-06-19 11:46:13.112776'),('3b61d4b7-aabb-4286-aced-42150ab8a2bb','SC-20260619-102551','Completed','[{\"productId\":\"234f1601-910d-4abc-b9cf-7070b678cf6b\",\"productName\":\"Noise Cancelling Headphones\",\"sku\":\"HP-NC4\",\"systemQuantity\":12,\"countedQuantity\":15,\"difference\":3,\"unit\":\"Adet\"},{\"productId\":\"461142df-89b1-4895-93e1-79e2ea581f69\",\"productName\":\"Dell UltraSharp 27\",\"sku\":\"DELL-U2722D\",\"systemQuantity\":22,\"countedQuantity\":22,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"5211a14d-1b7c-4172-95d2-a929fab32dbd\",\"productName\":\"Webcam HD 1080p\",\"sku\":\"WC-1080\",\"systemQuantity\":0,\"countedQuantity\":0,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"709dad6b-5692-42b4-a62c-d12714ae80bd\",\"productName\":\"Logitech MX Master 3S\",\"sku\":\"LOGI-MX3S-001\",\"systemQuantity\":45,\"countedQuantity\":45,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"8ea3efc3-f37e-4bab-8b9c-a0f38ce82f9e\",\"productName\":\"Laptop Stand Aluminum\",\"sku\":\"LS-ALUM\",\"systemQuantity\":80,\"countedQuantity\":80,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"989887ce-31bc-4bba-8898-bc0193691df2\",\"productName\":\"UltraWide Monitor 34\\\"\",\"sku\":\"MN-34U\",\"systemQuantity\":10,\"countedQuantity\":10,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"a1b471d5-b8bb-4675-864e-6bd011d2a8e6\",\"productName\":\"Sony WH-1000XM5\",\"sku\":\"SONY-WHXM5\",\"systemQuantity\":20,\"countedQuantity\":20,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"a359dd5e-b252-4adb-ac86-60ab1856b174\",\"productName\":\"Smart Watch Series 5\",\"sku\":\"SW-S5\",\"systemQuantity\":0,\"countedQuantity\":0,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"a9b39f00-c110-498a-8193-d1789b62c64f\",\"productName\":\"Bluetooth Speaker Portable\",\"sku\":\"SP-BT5\",\"systemQuantity\":1,\"countedQuantity\":1,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"b83aaef3-3a5a-4155-a172-65e26710f0c0\",\"productName\":\"Realtime Test Product\",\"sku\":\"RT-TEST-01\",\"systemQuantity\":5,\"countedQuantity\":5,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"c96f4ac1-1ec0-4dab-8445-2e786f29b44d\",\"productName\":\"USB-C Hub 8-in-1\",\"sku\":\"HB-81\",\"systemQuantity\":60,\"countedQuantity\":60,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"e65a113f-814e-44fd-94a6-b43c6a5c3b0d\",\"productName\":\"Mechanical Keyboard K85\",\"sku\":\"KB-85\",\"systemQuantity\":8,\"countedQuantity\":8,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"f0c3e672-73c8-41f1-9ffd-e6037ae7f1b3\",\"productName\":\"Ergonomik Ofis Koltu─ƒu\",\"sku\":\"FURN-ERGO-01\",\"systemQuantity\":3,\"countedQuantity\":3,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"f11aa47a-96b5-4101-b490-2737c44f0338\",\"productName\":\"Apple AirPods Pro 2\",\"sku\":\"AAPL-APP2\",\"systemQuantity\":25,\"countedQuantity\":25,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"f3cedb05-1378-4ecb-a073-893e7f4925bd\",\"productName\":\"Ergonomic Office Chair\",\"sku\":\"CH-ERGO\",\"systemQuantity\":3,\"countedQuantity\":3,\"difference\":0,\"unit\":\"Adet\"},{\"productId\":\"fc3d0137-7fcd-4acf-946b-f5fbe143d7f5\",\"productName\":\"Wireless Mouse M320\",\"sku\":\"MS-320\",\"systemQuantity\":45,\"countedQuantity\":45,\"difference\":0,\"unit\":\"Adet\"}]','2026-06-19 10:25:51','2026-06-19 10:26:15','Admin','','2026-06-19 10:25:51.382563');
/*!40000 ALTER TABLE `stock_counts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_orders`
--

DROP TABLE IF EXISTS `purchase_orders`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_orders` (
  `id` varchar(36) NOT NULL,
  `poNumber` varchar(255) NOT NULL,
  `supplierId` varchar(255) DEFAULT NULL,
  `supplierName` varchar(255) NOT NULL,
  `status` varchar(255) NOT NULL DEFAULT 'Draft',
  `totalAmount` decimal(10,2) NOT NULL DEFAULT 0.00,
  `expectedDate` varchar(255) DEFAULT NULL,
  `notes` varchar(255) DEFAULT NULL,
  `createdAt` datetime(6) NOT NULL DEFAULT current_timestamp(6),
  `updatedAt` datetime(6) NOT NULL DEFAULT current_timestamp(6) ON UPDATE current_timestamp(6),
  PRIMARY KEY (`id`),
  UNIQUE KEY `IDX_2e0fc7a6605393a9bd691cdceb` (`poNumber`),
  KEY `IDX_0c3ff892a9f2ed16f59d31ccca` (`supplierId`),
  KEY `IDX_5272ac3aa931eedb14cd8789d6` (`status`),
  KEY `IDX_17ba54818dc8b8ea63659598f9` (`createdAt`),
  CONSTRAINT `FK_0c3ff892a9f2ed16f59d31cccae` FOREIGN KEY (`supplierId`) REFERENCES `suppliers` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_orders`
--

LOCK TABLES `purchase_orders` WRITE;
/*!40000 ALTER TABLE `purchase_orders` DISABLE KEYS */;
INSERT INTO `purchase_orders` VALUES ('0088163a-ce31-4d3b-8c2b-d1e08a3292f7','PO-1003','362f2eca-e2b3-4575-b64f-96f2ff04bbab','Ofis Merkezi Ltd. ┼₧ti.','Received',999.95,NULL,NULL,'2026-06-19 13:29:04.533699','2026-06-19 13:50:37.000000'),('5b4c36ae-141d-471b-a3ca-8f14a65b39f2','PO-1781952221465-1431','362f2eca-e2b3-4575-b64f-96f2ff04bbab','Ofis Merkezi Ltd. ┼₧ti.','Received',6599.67,'','','2026-06-20 13:43:41.477956','2026-06-24 08:38:29.000000'),('7b4e3b62-9d19-434f-8a8f-ae15112cbda4','PO-1781951680871-7468','362f2eca-e2b3-4575-b64f-96f2ff04bbab','Ofis Merkezi Ltd. ┼₧ti.','Draft',599.97,'2026-06-20','Test','2026-06-20 13:34:40.886716','2026-06-20 13:34:40.886716'),('a7499238-98db-41d8-a00d-2806deb01840','PO-1004','362f2eca-e2b3-4575-b64f-96f2ff04bbab','Ofis Merkezi Ltd. ┼₧ti.','Received',999.95,NULL,NULL,'2026-06-19 13:29:25.048590','2026-06-19 13:40:51.000000'),('c31683ea-f58f-4d61-b4dd-1d8cc46d49c4','PO-1002','c8d9d371-5de4-4f13-a608-da267b64e518','Tech supplies A.┼₧.','Sent',599.80,'2026-06-25','','2026-06-19 13:24:26.001671','2026-06-19 13:44:01.000000'),('f078c920-9e48-43c1-b71b-dce249b7ccd4','PO-1001','c8d9d371-5de4-4f13-a608-da267b64e518','Tech supplies A.┼₧.','Received',0.00,'2026-06-25','Acil sipari┼ƒ','2026-06-19 09:36:34.239051','2026-06-19 09:36:34.000000');
/*!40000 ALTER TABLE `purchase_orders` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `purchase_order_items`
--

DROP TABLE IF EXISTS `purchase_order_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `purchase_order_items` (
  `id` varchar(36) NOT NULL,
  `productId` varchar(255) DEFAULT NULL,
  `productName` varchar(255) NOT NULL,
  `quantity` int(11) NOT NULL,
  `price` decimal(10,2) NOT NULL,
  `purchaseOrderId` varchar(255) NOT NULL,
  PRIMARY KEY (`id`),
  KEY `FK_1de7eb246940b05765d2c99a7ec` (`purchaseOrderId`),
  KEY `FK_f87b1b82a3aff16d1cb5e49a656` (`productId`),
  CONSTRAINT `FK_1de7eb246940b05765d2c99a7ec` FOREIGN KEY (`purchaseOrderId`) REFERENCES `purchase_orders` (`id`) ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT `FK_f87b1b82a3aff16d1cb5e49a656` FOREIGN KEY (`productId`) REFERENCES `products` (`id`) ON DELETE SET NULL ON UPDATE NO ACTION
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `purchase_order_items`
--

LOCK TABLES `purchase_order_items` WRITE;
/*!40000 ALTER TABLE `purchase_order_items` DISABLE KEYS */;
/*!40000 ALTER TABLE `purchase_order_items` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-07-17 10:33:07
